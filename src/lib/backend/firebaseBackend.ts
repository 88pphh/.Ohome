'use client';
// Firebase 백엔드 — Firestore(문서=항목) + Auth + Storage
// 권한 규칙: firebase/firestore.rules · firebase/storage.rules
//
// Supabase 판과 같은 모양으로 맞춘 부분:
//  · 컬렉션 이름 동일 (posts, characters, …)
//  · 문서 = 항목 하나, 필드는 { data, authorId, visibility, sort }
//  · 관리자 판정은 meta/owner 문서 — 첫 로그인 계정이 소유자로 등록된다(규칙이 1회만 허용)
import {
  Backend, BackendCheck, BackendConfig, BackendUser, ListItem, diffList, metaOf,
} from './types';

type FirebaseCfg = Extract<BackendConfig, { kind: 'firebase' }>;

export async function createFirebaseBackend(cfg: FirebaseCfg): Promise<Backend> {
  const [{ initializeApp, getApps, getApp }, authMod, fsMod, stMod] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
    import('firebase/storage'),
  ]);

  const app = getApps().length ? getApp() : initializeApp({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    storageBucket: cfg.storageBucket,
    appId: cfg.appId,
    ...(cfg.messagingSenderId ? { messagingSenderId: cfg.messagingSenderId } : {}),
  });

  const auth = authMod.getAuth(app);
  const db = fsMod.getFirestore(app);
  const storage = stMod.getStorage(app);

  const {
    collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, onSnapshot, writeBatch, limit,
  } = fsMod;

  /** 관리자 여부 — meta/owner 문서의 uid 또는 admins 목록 */
  const ownerInfo = async (): Promise<{ uid?: string; admins?: string[] } | null> => {
    try {
      const snap = await getDoc(doc(db, 'meta', 'owner'));
      return snap.exists() ? (snap.data() as { uid?: string; admins?: string[] }) : null;
    } catch { return null; }
  };

  const toUser = async (u: { uid: string; email?: string | null; displayName?: string | null } | null): Promise<BackendUser | null> => {
    if (!u) return null;
    let nickname = u.displayName ?? u.email ?? 'user';
    let avatarUrl: string | undefined;
    let avatarColor: string | undefined;
    try {
      const p = await getDoc(doc(db, 'profiles', u.uid));
      if (p.exists()) {
        const d = p.data() as { nickname?: string; avatarUrl?: string; avatarColor?: string };
        nickname = d.nickname ?? nickname;
        avatarUrl = d.avatarUrl;
        avatarColor = d.avatarColor;
      }
    } catch { /* 규칙이 막으면 기본값 */ }
    const own = await ownerInfo();
    const isAdmin = !!own && (own.uid === u.uid || (own.admins ?? []).includes(u.uid));
    return {
      id: u.uid, nickname, role: isAdmin ? 'admin' : 'member',
      email: u.email ?? undefined, avatarUrl, avatarColor,
    };
  };

  const humanError = (e: unknown): string => {
    const code = (e as { code?: string })?.code ?? '';
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
      return '아이디 또는 비밀번호가 올바르지 않습니다.';
    }
    if (code.includes('email-already-in-use')) return '이미 사용 중인 이메일입니다.';
    if (code.includes('weak-password')) return '비밀번호는 6자 이상이어야 합니다.';
    if (code.includes('invalid-email')) return '이메일 형식이 올바르지 않습니다.';
    if (code.includes('operation-not-allowed')) return 'Firebase 콘솔에서 이메일/비밀번호 로그인을 켜 주세요 (Authentication → Sign-in method).';
    if (code.includes('permission-denied')) return '권한이 없습니다 — 보안 규칙이 적용됐는지 확인해 주세요.';
    return (e as { message?: string })?.message ?? '알 수 없는 오류입니다.';
  };

  return {
    kind: 'firebase',

    async check(): Promise<BackendCheck> {
      const fail = (p: Partial<BackendCheck>): BackendCheck =>
        ({ ok: false, reachable: false, schema: false, hasAdmin: false, message: '', ...p });
      // Firestore SDK는 못 닿는 프로젝트에 계속 재시도하므로 시간 제한을 둔다 (v2.0)
      const timeout = Symbol('timeout');
      const withLimit = <X,>(p: Promise<X>, ms = 12000) =>
        Promise.race([p, new Promise<typeof timeout>(r => setTimeout(() => r(timeout), ms))]);
      // Firestore는 테이블을 미리 만들지 않는다 — 대신 "읽기가 되는지(규칙 적용 여부)"를 본다
      try {
        const r = await withLimit(getDocs(query(collection(db, 'settings'), limit(1))));
        if (r === timeout) {
          return fail({ message: '응답이 없습니다 — projectId가 맞는지, Firestore 데이터베이스를 만들었는지 확인해 주세요.' });
        }
      } catch (e) {
        const code = (e as { code?: string })?.code ?? '';
        if (code.includes('permission-denied')) {
          return fail({ reachable: true, message: '보안 규칙이 아직 적용되지 않았습니다 — 아래 규칙을 Firebase 콘솔의 Firestore → 규칙에 붙여넣고 게시해 주세요.' });
        }
        if (code.includes('unavailable') || code.includes('failed-precondition')) {
          return fail({ message: 'Firestore가 아직 준비되지 않았습니다 — Firebase 콘솔에서 Firestore 데이터베이스를 먼저 만들어 주세요.' });
        }
        return fail({ message: `연결에 실패했습니다 — ${humanError(e)}` });
      }
      const own = await ownerInfo();
      const hasAdmin = !!own?.uid;
      return {
        ok: true, reachable: true, schema: true, hasAdmin,
        message: hasAdmin ? '연결 완료 — 관리자 계정이 이미 있습니다. 그 계정으로 로그인해 주세요.'
          : '연결 완료 — 이제 관리자 계정을 만들면 됩니다. 첫 번째 계정이 이 홈의 관리자가 됩니다.',
      };
    },

    async currentUser() {
      // 새로고침 직후 auth 복원을 기다린다
      const u = await new Promise<typeof auth.currentUser>(res => {
        const off = authMod.onAuthStateChanged(auth, x => { off(); res(x); });
      });
      return toUser(u);
    },

    onAuthChange(cb) {
      return authMod.onAuthStateChanged(auth, u => { void toUser(u).then(cb); });
    },

    async signIn(id, password) {
      try {
        await authMod.signInWithEmailAndPassword(auth, id, password);
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; }
    },

    async signUp(id, password, nickname) {
      try {
        const cred = await authMod.createUserWithEmailAndPassword(auth, id, password);
        await authMod.updateProfile(cred.user, { displayName: nickname });
        await setDoc(doc(db, 'profiles', cred.user.uid), { nickname, createdAt: Date.now() }, { merge: true });
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; }
    },

    async signOut() { await authMod.signOut(auth); },

    async resetPassword(email) {
      try {
        await authMod.sendPasswordResetEmail(auth, email);
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; }
    },

    async updateProfile(patch) {
      const u = auth.currentUser;
      if (!u) return { ok: false, error: '로그인이 필요합니다.' };
      try {
        const row: Record<string, unknown> = {};
        if (patch.nickname !== undefined) row.nickname = patch.nickname;
        if (patch.avatarUrl !== undefined) row.avatarUrl = patch.avatarUrl ?? null;
        if (patch.avatarColor !== undefined) row.avatarColor = patch.avatarColor ?? null;
        await setDoc(doc(db, 'profiles', u.uid), row, { merge: true });
        if (patch.nickname) await authMod.updateProfile(u, { displayName: patch.nickname });
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; }
    },

    /** 첫 계정을 소유자(관리자)로 등록 — 규칙이 "없을 때 1회"만 허용한다 */
    async claimOwner() {
      const u = auth.currentUser;
      if (!u) return { ok: false, error: '로그인이 필요합니다.' };
      try {
        const own = await ownerInfo();
        if (own?.uid) return { ok: true };   // 이미 소유자 있음
        await setDoc(doc(db, 'meta', 'owner'), { uid: u.uid, admins: [u.uid], at: Date.now() });
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; }
    },

    async listMembers() {
      const own = await ownerInfo();
      const admins = new Set([own?.uid, ...(own?.admins ?? [])].filter(Boolean) as string[]);
      const snap = await getDocs(collection(db, 'profiles'));
      return snap.docs.map(d => {
        const v = d.data() as { nickname?: string };
        return {
          id: d.id,
          nickname: v.nickname ?? d.id,
          role: (admins.has(d.id) ? 'admin' : 'member') as 'admin' | 'member',
        };
      });
    },

    async fetchList<T extends ListItem>(coll: string): Promise<T[]> {
      const snap = await getDocs(query(collection(db, coll), orderBy('sort', 'asc')));
      return snap.docs.map(d => {
        const raw = d.data() as { data?: Record<string, unknown> };
        return { ...(raw.data ?? {}), id: d.id } as T;
      });
    },

    async syncList<T extends ListItem>(coll: string, prev: T[], next: T[], uid: string | null) {
      const { inserts, updates, deletes } = diffList(prev, next);
      const ops = [...inserts, ...updates];
      // Firestore 배치는 500개 제한 — 넉넉히 400개씩 끊는다
      const chunk = <X,>(arr: X[], n: number) =>
        Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

      for (const part of chunk(ops, 400)) {
        const batch = writeBatch(db);
        part.forEach(({ item, sort }) => {
          const { authorId, visibility } = metaOf(item, uid);
          batch.set(doc(db, coll, item.id), {
            data: item, authorId, visibility, sort, updatedAt: Date.now(),
          });
        });
        await batch.commit();
      }
      for (const part of chunk(deletes, 400)) {
        const batch = writeBatch(db);
        part.forEach(id => batch.delete(doc(db, coll, id)));
        await batch.commit();
      }
    },

    subscribe(coll, onChange) {
      return onSnapshot(query(collection(db, coll), orderBy('sort', 'asc')), () => onChange(), () => { /* 권한 없음 등은 무시 */ });
    },

    async fetchSetting<T>(key: string) {
      const snap = await getDoc(doc(db, 'settings', key));
      return snap.exists() ? ((snap.data() as { value: T }).value ?? null) : null;
    },

    async saveSetting(key, value) {
      await setDoc(doc(db, 'settings', key), { value, updatedAt: Date.now() });
    },

    async fetchAllSettings() {
      const snap = await getDocs(collection(db, 'settings'));
      const out: Record<string, unknown> = {};
      snap.docs.forEach(d => { out[d.id] = (d.data() as { value: unknown }).value; });
      return out;
    },

    async uploadFile(blob, ext) {
      const path = `ohome/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const r = stMod.ref(storage, path);
      // 경로가 업로드마다 고유하므로 내용이 바뀌지 않는다 — 길게 캐시해 재방문·엣지 캐시 이득을 본다
      // (지정하지 않으면 브라우저가 매번 다시 받아 먼 지역 버킷에서 지연이 그대로 드러남)
      await stMod.uploadBytes(r, blob, {
        contentType: blob.type || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable',
      });
      return await stMod.getDownloadURL(r);
    },
  };

  // (deleteDoc은 삭제 배치에서 doc 단위로 쓰지 않아 참조만 유지)
  void deleteDoc;
}
