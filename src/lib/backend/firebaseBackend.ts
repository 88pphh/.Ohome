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
  // 콘솔에서 데이터베이스를 (default)가 아닌 이름으로 만든 경우를 위해 ID를 받는다
  const dbId = (cfg.databaseId ?? '').trim();
  const named = !!dbId && dbId !== '(default)';
  // ignoreUndefinedProperties — 화면 데이터에는 값이 없는 필드가 undefined로 남는데(grants 등),
  // JSON 저장에서는 자동으로 빠지지만 Firestore는 거부한다. 같은 동작이 되도록 건너뛰게 한다.
  const db = (() => {
    const opts = { ignoreUndefinedProperties: true };
    try {
      return named ? fsMod.initializeFirestore(app, opts, dbId) : fsMod.initializeFirestore(app, opts);
    } catch {
      // 이미 만들어진 인스턴스가 있으면 그걸 쓴다 (백엔드를 두 번 만드는 경로)
      return named ? fsMod.getFirestore(app, dbId) : fsMod.getFirestore(app);
    }
  })();
  const storage = stMod.getStorage(app);

  const {
    collection, doc, getDoc, getDocs, getDocsFromServer, setDoc, deleteDoc, query, orderBy, onSnapshot, writeBatch, limit,
  } = fsMod;

  // Firestore SDK는 서버에 못 닿으면 무한 재시도한다 — 쓰기가 영영 안 끝나는 것을 막는다
  const TIMEOUT = Symbol('timeout');
  const withLimit = <X,>(p: Promise<X>, ms = 12000) =>
    Promise.race([p, new Promise<typeof TIMEOUT>(r => setTimeout(() => r(TIMEOUT), ms))]);
  const NO_REACH = dbId
    ? `Firestore에 저장하지 못했습니다 — 데이터베이스 ID "${dbId}"가 맞는지 확인해 주세요.`
    : 'Firestore에 저장하지 못했습니다 — 데이터베이스가 만들어졌는지, 이름이 (default)인지 확인해 주세요.';

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
      // Firestore는 테이블을 미리 만들지 않는다 — 대신 "읽기가 되는지(규칙 적용 여부)"를 본다.
      // 반드시 getDocsFromServer — 일반 getDocs는 서버에 못 닿아도 로컬 캐시로 성공해서,
      // 데이터베이스가 없는데도 확인을 통과시켜 버린다(그 뒤 쓰기에서 멈춘다).
      try {
        const r = await withLimit(getDocsFromServer(query(collection(db, 'settings'), limit(1))));
        if (r === TIMEOUT) {
          return fail({ message: '응답이 없습니다 — projectId가 맞는지, Firestore 데이터베이스를 만들었는지 확인해 주세요.' });
        }
      } catch (e) {
        const code = (e as { code?: string })?.code ?? '';
        const msg = (e as { message?: string })?.message ?? '';
        if (code.includes('permission-denied')) {
          return fail({ reachable: true, message: '보안 규칙이 아직 적용되지 않았습니다 — 아래 규칙을 Firebase 콘솔의 Firestore → 규칙에 붙여넣고 게시해 주세요.' });
        }
        // 데이터베이스 자체가 없을 때 — 가장 흔한 첫 설치 실수
        if (code.includes('not-found') || /Database .* not found|NOT_FOUND/i.test(msg)) {
          return fail({
            message: dbId
              ? `"${dbId}" 데이터베이스를 찾을 수 없습니다 — Firebase 콘솔의 Firestore Database에서 그 이름이 맞는지 확인해 주세요.`
              : 'Firestore 데이터베이스가 없습니다 — Firebase 콘솔 → Firestore Database에서 [데이터베이스 만들기]를 먼저 해 주세요. 이미 만들었다면 데이터베이스 ID가 (default)인지 확인해 주세요.',
          });
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
        const r = await withLimit(
          setDoc(doc(db, 'profiles', cred.user.uid), { nickname, createdAt: Date.now() }, { merge: true }));
        // 계정(Auth)은 이미 만들어졌으므로 그 사실을 알려 준다 — 다시 시도하면 "이미 사용 중"이 뜬다
        if (r === TIMEOUT) return { ok: false, error: `${NO_REACH} (로그인 계정은 이미 만들어졌습니다)` };
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
        const r = await withLimit(setDoc(doc(db, 'meta', 'owner'), { uid: u.uid, admins: [u.uid], at: Date.now() }));
        if (r === TIMEOUT) return { ok: false, error: NO_REACH };
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
