'use client';
// 데이터 덤프/적재 공용 엔진 (v2.0)
//
// 백업(zip)·복원·다른 DB로 이전이 모두 같은 일을 한다:
//   ① 지금 저장소에서 콘텐츠·설정·이미지를 전부 읽어 스냅샷으로 만들고
//   ② 대상 저장소에 그대로 밀어 넣는다.
// 저장소가 바뀌면 이미지 주소도 바뀌므로, 옮긴 파일의 새 주소로 데이터 안의 참조를 치환한다.
// (문자열이 정확히 같을 때만 바꾸므로 엉뚱한 값이 변형될 일이 없다)
import { backend, COLLECTION_OF, CONTENT_COLLECTIONS } from './backend';
import type { Backend, ListItem } from './backend';
import { allBlobs, getBlob, putBlobAs, putBlob } from './blobStore';
import { getSetting, setSetting } from './settingStore';

export interface Snapshot {
  version: 2;
  createdAt: string;
  collections: Record<string, ListItem[]>;   // 컬렉션 → 항목들
  settings: Record<string, unknown>;         // 사이트 설정
  members?: { id: string; nickname: string; role: string }[];   // 기록용 (계정 자체는 옮길 수 없음)
}

export type Progress = (msg: string, done?: number, total?: number) => void;

/** 사이트 설정으로 다루는 키 — 백업·이전 대상 */
const SETTING_KEYS = [
  'ohome.theme.v2', 'ohome.themePresets.v1', 'ohome.fonts.v2', 'ohome.menuset.v1', 'ohome.site.v1',
  'ohome.pagetext.v1', 'ohome.cursor.v1', 'ohome.bgm.v1', 'ohome.boardset.v1', 'ohome.boards.v1',
  'ohome.commset.v1', 'ohome.memoset.v1', 'ohome.threadset.v1', 'ohome.trpgset.v1',
  'ohome.relqsets.v1', 'ohome.main.v1', 'ohome.sched.v1', 'ohome.notifset.v1',
  'ohome.membertags.v1', 'ohome.invite.v1', 'ohome.roadnext.v1',
];

/* ---------- 이미지 참조 ---------- */

/** 저장소가 만든 이미지 주소인지 (Supabase Storage / Firebase Storage) */
export function isFileUrl(s: string): boolean {
  return /\/storage\/v1\/object\/public\//.test(s) || /firebasestorage\.googleapis\.com/.test(s);
}

/** 데이터 전체를 훑어 파일 참조 문자열을 모은다 (로컬 파일 id는 known으로 알려 준다) */
export function collectRefs(value: unknown, known: Set<string>, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    if (isFileUrl(value) || known.has(value)) out.add(value);
    return out;
  }
  if (Array.isArray(value)) { value.forEach(v => collectRefs(v, known, out)); return out; }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(v => collectRefs(v, known, out));
  }
  return out;
}

/** 참조 치환 — 문자열이 정확히 일치할 때만 바꾼다 */
export function replaceRefs<T>(value: T, map: Map<string, string>): T {
  if (typeof value === 'string') return (map.get(value) ?? value) as unknown as T;
  if (Array.isArray(value)) return value.map(v => replaceRefs(v, map)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => { out[k] = replaceRefs(v, map); });
    return out as unknown as T;
  }
  return value;
}

/**
 * 어디에서도 참조하지 않는 저장소 파일 찾기 (환경설정 > 데이터 백업의 이미지 정리).
 *
 * 글을 지워도 이미지는 저장소에 남는다 — 같은 이미지를 다른 글이 쓰고 있을 수 있어
 * 삭제와 동시에 지우는 것은 위험하기 때문. 대신 전체를 훑어 아무도 안 쓰는 것만 골라
 * 관리자가 확인하고 지운다.
 */
export async function findOrphanFiles(be: Backend): Promise<{ ref: string; size: number }[]> {
  const snap = await dumpAll(be);
  const used = new Set<string>();
  collectRefs(snap.collections, new Set(), used);
  collectRefs(snap.settings, new Set(), used);
  const all = await be.listFiles();
  return all.filter(f => !used.has(f.ref));
}

/* ---------- 덤프 ---------- */

/** 지금 저장소(서버 또는 브라우저)에서 전부 읽어 스냅샷 만들기 */
export async function dumpAll(be: Backend | null, onProgress?: Progress): Promise<Snapshot> {
  const snap: Snapshot = {
    version: 2, createdAt: new Date().toISOString(), collections: {}, settings: {},
  };

  if (be) {
    let i = 0;
    for (const coll of CONTENT_COLLECTIONS) {
      onProgress?.(`${coll} 읽는 중`, i, CONTENT_COLLECTIONS.length);
      try { snap.collections[coll] = await be.fetchList(coll); } catch { snap.collections[coll] = []; }
      i += 1;
    }
    onProgress?.('설정 읽는 중');
    try { snap.settings = await be.fetchAllSettings(); } catch { snap.settings = {}; }
    try { snap.members = await be.listMembers(); } catch { /* 권한 없으면 생략 */ }
    return snap;
  }

  // 브라우저 저장 모드
  Object.entries(COLLECTION_OF).forEach(([key, coll]) => {
    try {
      const raw = localStorage.getItem(key);
      snap.collections[coll] = raw ? JSON.parse(raw) : [];
    } catch { snap.collections[coll] = []; }
  });
  SETTING_KEYS.forEach(k => {
    const v = getSetting<unknown>(k, undefined);
    if (v !== undefined) snap.settings[k] = v;
  });
  return snap;
}

/* ---------- 적재 ---------- */

/**
 * 스냅샷을 대상 저장소에 넣는다.
 * files: 참조 → 원본 바이트를 얻는 함수 (백업 zip 복원이면 zip에서, DB 이전이면 원본 저장소에서)
 */
export async function loadAll(
  target: Backend | null,
  snap: Snapshot,
  getFile: (ref: string) => Promise<Blob | null>,
  onProgress?: Progress,
): Promise<{ files: number; items: number }> {
  // ① 이미지부터 옮기고 새 주소 표를 만든다
  const knownLocal = new Set<string>();
  try { (await allBlobs()).forEach((_v, k) => knownLocal.add(k)); } catch { /* 무시 */ }
  const refs = collectRefs({ c: snap.collections, s: snap.settings }, knownLocal);
  const map = new Map<string, string>();
  let fileCount = 0;
  let idx = 0;
  for (const ref of refs) {
    idx += 1;
    onProgress?.('이미지 옮기는 중', idx, refs.size);
    try {
      const blob = await getFile(ref);
      if (!blob) continue;
      const next = target
        ? await target.uploadFile(blob, extOfRef(ref, blob))
        : await putSameOrNew(ref, blob);
      if (next !== ref) map.set(ref, next);
      fileCount += 1;
    } catch { /* 개별 파일 실패는 건너뜀 */ }
  }

  // ② 참조를 새 주소로 바꾼 데이터 적재
  const collections = replaceRefs(snap.collections, map);
  const settings = replaceRefs(snap.settings, map);

  let items = 0;
  if (target) {
    let i = 0;
    for (const [coll, list] of Object.entries(collections)) {
      i += 1;
      onProgress?.(`${coll} 저장 중`, i, Object.keys(collections).length);
      const rows = (list ?? []) as ListItem[];
      if (!rows.length) continue;
      await target.syncList(coll, [], rows, null);
      items += rows.length;
    }
    for (const [k, v] of Object.entries(settings)) {
      if (v === undefined || v === null) continue;
      await target.saveSetting(k, v);
    }
    return { files: fileCount, items };
  }

  // 브라우저 저장 모드
  const keyOf = Object.fromEntries(Object.entries(COLLECTION_OF).map(([k, c]) => [c, k]));
  Object.entries(collections).forEach(([coll, list]) => {
    const key = keyOf[coll];
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(list ?? [])); } catch { /* 무시 */ }
    items += (list as ListItem[])?.length ?? 0;
  });
  Object.entries(settings).forEach(([k, v]) => { if (v !== undefined && v !== null) setSetting(k, v); });
  return { files: fileCount, items };
}

/** 로컬 저장 시 — 원래 id를 그대로 쓰면 참조 치환이 필요 없다 */
async function putSameOrNew(ref: string, blob: Blob): Promise<string> {
  if (isFileUrl(ref)) return putBlob(blob);   // URL → 새 로컬 id
  await putBlobAs(ref, blob);
  return ref;
}

function extOfRef(ref: string, blob: Blob): string {
  const m = ref.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  if (m) return m[1].toLowerCase();
  const t = blob.type || '';
  if (t.includes('png')) return 'png';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webp')) return 'webp';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  return 'bin';
}

/** 참조로 원본 바이트 얻기 — 현재 저장소 기준 (DB 이전·백업 만들 때) */
export async function readFileByRef(ref: string): Promise<Blob | null> {
  if (isFileUrl(ref)) {
    try {
      const res = await fetch(ref);
      return res.ok ? await res.blob() : null;
    } catch { return null; }
  }
  return getBlob(ref);
}

/** 다른 DB로 통째 이전 — 현재 저장소에서 읽어 새 백엔드에 넣는다 */
export async function migrateTo(target: Backend, onProgress?: Progress): Promise<{ files: number; items: number }> {
  onProgress?.('현재 데이터 읽는 중');
  const snap = await dumpAll(backend(), onProgress);
  return loadAll(target, snap, readFileByRef, onProgress);
}
