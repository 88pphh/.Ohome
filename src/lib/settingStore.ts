'use client';
// 사이트 설정 저장 계층 (v2.0)
//
// 테마·메뉴·폰트·로고·메인 위젯 배치 같은 값은 "관리자가 정하고 방문자 모두가 보는" 값이다.
// 지금까지는 브라우저(localStorage)에만 있어서, 공개 홈에서는 방문자가 기본 테마를 보게 된다.
// → 서버 모드에서는 DB(site_settings / settings)에 저장하고, 앱 시작 때 한 번에 받아 캐시한다.
//
// 각 스토어는 렌더 도중 동기적으로 값을 읽으므로, ServerBoot가 화면을 그리기 전에
// primeSettings()로 캐시를 채운다. 이후 읽기는 전부 동기(캐시)라 기존 코드 모양이 유지된다.
// 쓰기는 캐시 → localStorage(첫 페인트용 사본) → DB 순으로 나간다.
import { backend, isServerMode } from './backend';

const cache = new Map<string, unknown>();
let primed = false;
const EVT = 'ohome-settings';

/** 브라우저에만 두는 값 — 접힘 상태·세션·연결 설정처럼 사람마다 다른 것 */
const LOCAL_ONLY = new Set<string>([
  'ohome.bgm.fold', 'ohome.mockuser.v1', 'ohome.server.v1', 'ohome.setup.v1',
  'ohome.themeCss.v1',   // 첫 페인트용 파생 캐시 (원본은 ohome.theme.v2)
  'ohome.notif.v1',      // 알림 목록은 사람별
]);

/** 앱 시작 시 1회 — 서버에 저장된 설정을 전부 받아 캐시 */
export async function primeSettings(): Promise<void> {
  primed = true;
  const be = backend();
  if (!be) return;
  try {
    const all = await be.fetchAllSettings();
    Object.entries(all).forEach(([k, v]) => {
      cache.set(k, v);
      // 첫 페인트를 위해 로컬에도 사본을 둔다 (다음 방문 때 깜빡임 감소)
      try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ }
    });
  } catch {
    /* 규칙·네트워크 문제면 로컬 값으로 동작 */
  }
}

export function settingsPrimed(): boolean { return primed; }

/** 동기 읽기 — 서버 캐시 > localStorage > 기본값 */
export function getSetting<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw) as T; } catch {
      // 예전에 문자열을 그대로 저장한 값(가입코드 등) 호환
      return (typeof fallback === 'string' ? raw : fallback) as T;
    }
  } catch { /* 무시 */ }
  return fallback;
}

/** 문자열 그대로 저장된 값(구버전 호환)용 — JSON이 아니어도 읽는다 */
export function getRawSetting(key: string): string | null {
  if (cache.has(key)) {
    const v = cache.get(key);
    return typeof v === 'string' ? v : JSON.stringify(v);
  }
  try { return localStorage.getItem(key); } catch { return null; }
}

/** 저장 — 캐시·로컬 사본·DB 순. DB 저장 실패는 조용히 무시(로컬은 남는다) */
export function setSetting(key: string, value: unknown): void {
  cache.set(key, value);
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 무시 */ }
  if (isServerMode() && !LOCAL_ONLY.has(key)) {
    void backend()?.saveSetting(key, value).catch(err => console.error('[ohome] 설정 저장 실패', key, err));
  }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: key })); } catch { /* 무시 */ }
}

export function removeSetting(key: string): void {
  cache.delete(key);
  try { localStorage.removeItem(key); } catch { /* 무시 */ }
  if (isServerMode() && !LOCAL_ONLY.has(key)) {
    void backend()?.saveSetting(key, null).catch(() => { /* 무시 */ });
  }
}

/** 다른 화면에서 같은 설정을 바꿨을 때 알림 */
export function onSettingChange(cb: (key: string) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent).detail as string);
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

/** 이 브라우저에 꾸며 둔 설정을 서버로 올리기 (연결 직후 1회 — 환경설정에서 호출) */
export async function pushLocalSettings(keys: string[]): Promise<number> {
  const be = backend();
  if (!be) return 0;
  let n = 0;
  for (const k of keys) {
    if (LOCAL_ONLY.has(k)) continue;
    try {
      const raw = localStorage.getItem(k);
      if (raw == null) continue;
      await be.saveSetting(k, JSON.parse(raw));
      cache.set(k, JSON.parse(raw));
      n += 1;
    } catch { /* 개별 실패는 건너뜀 */ }
  }
  return n;
}
