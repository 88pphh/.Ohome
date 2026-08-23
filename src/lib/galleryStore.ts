// 그림 로드뷰(4.10)·그림백업(4.11)·TRPG 백업(4.3) 데이터 — localStorage (→ Supabase/R2 이전 예정)
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { Comment, FoldType } from './postStore';
import type { CropValue } from '@/components/ui/CropEditor';
import type { Visibility } from './charStore';
import { getRawSetting, setSetting } from './settingStore';

/* ---------- 로드뷰 (4.10) ---------- */
export interface RoadItem {
  id: string;
  title: string;
  author: string;
  authorId: string;
  date: string;              // ISO
  imgUrl?: string;           // (구) URL — 새 업로드는 imgId 사용
  imgId?: string;            // IndexedDB 파일 id (blobStore — 새로고침에도 유지)
  ph: string;                // 데모 플레이스홀더 클래스
  narrow?: boolean;          // 원본 가로가 좁은 이미지 (가운데 정렬)
  ratio: string;             // aspect-ratio 값
  fold: { type: FoldType; label?: string } | null;
  comments: Comment[];
  no?: number;               // 그림 번호 (v1.9 — 제목 대신 번호로 식별, 알림도 번호 기준)
}

export const ROAD_SEED: RoadItem[] = [];

/* ---------- 그림백업 (4.11) ---------- */
export interface BackupPost {
  id: string;
  title: string;
  type: 'log' | 'single' | 'vlist';    // 로그형(틈 없이 세로) / 단일형(좌우 넘김) / 단일 세로정렬(갭 있는 세로, v1.9)
  images: string[];          // 파일 id 또는 URL (비어 있으면 데모 ph — blobStore 참조)
  thumbCrop?: CropValue;     // 대표(첫) 이미지의 썸네일 크롭 (6.1)
  phList: string[];          // 데모 플레이스홀더
  desc: string;
  category: string;          // 말머리
  madeDate?: string;         // 제작일 (선택)
  date: string;
  author: string;
  authorId: string;
  visibility: Visibility;
  fold: { type: FoldType; label?: string } | null;
}

export const BACKUP_SEED: BackupPost[] = [];

export const BACKUP_CATEGORIES = ['합작', '낙서', '커미션', '설정화'];

/* ---------- TRPG 백업 (4.3) ---------- */
export interface TrpgLog {
  id: string;
  no: number;                // 내부 순번 (정렬용 — 자동 부여)
  noText?: string;           // № 자리 표시 텍스트 (선택 — 비우면 자동 № 0XX)
  title: string;             // 시나리오 타이틀 (필수)
  catchphrase?: string;      // 캐치프레이즈 한 줄 (선택)
  writer: string;            // 라이터 (필수)
  withText: string;          // 같이 간 사람 표기 (필수)
  relId?: string;            // 자관 연동 (필터)
  date?: string;             // 선택
  ph: string;
  thumbUrl?: string;
  thumbId?: string;          // 업로드 썸네일 (IndexedDB)
  thumbCrop?: CropValue;     // 썸네일 크롭 좌표 (6.1)
  thumbColor?: { c1: string; c2?: string }; // 이미지 없을 때 단색/그라데이션
  serifTitle?: boolean;      // 타이틀 폰트 개별 지정 예시 (폰트 라이브러리는 후속)
  body: string;              // 로그 본문 (소형/시드용 — 대형 로그는 bodyId 사용)
  bodyId?: string;           // IndexedDB 본문 파일 id (대용량 로그 — localStorage 용량 보호)
  originalFileId?: string;   // 업로드 원본 파일 보관 (4.3 — 백업 목적)
  originalName?: string;
  visibility: Visibility;
  password?: string;         // 열람 비밀번호 (선택) — 권한이 없어도 비밀번호로 열람 가능
}

/** № 자리 표시 — 직접 입력한 텍스트가 있으면 그대로, 없으면 자동 № 0XX */
export const logNo = (l: TrpgLog) => l.noText || `№ ${String(l.no).padStart(3, '0')}`;

/** 본문이 HTML 문서인지 자동 판별 (4.3 — 확장자와 무관하게 내용 기준) */
export const isHtmlBody = (s: string) => /<\s*(html|body|div|p|span|table|br|style|font)[^>]*>/i.test(s);

/** 로그 파일 인코딩 자동 판별 — UTF-8 우선, 깨짐 문자가 많으면 EUC-KR 재시도 (구형 로그 툴 대응) */
export async function decodeLogText(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  const bad = (utf8.match(/�/g) || []).length;
  if (bad > 2) {
    try { return new TextDecoder('euc-kr').decode(buf); } catch { return utf8; }
  }
  return utf8;
}

/* ---------- TRPG 도토리 (4.15) — 시나리오 위시리스트 ---------- */
export type DotoriStatus = 'pledge' | 'undecided' | 'confirmed' | 'done';
export const DOTORI_STATUS_LABEL: Record<DotoriStatus, string> = {
  pledge: '공수표', undecided: '일정 미정', confirmed: '일정 확정', done: '완',
};

/* ---------- TRPG 설정 (환경설정 > TRPG 탭, v1.9) — 상태 카테고리 라벨 + 뱃지 색 ---------- */
export interface DotoriStatusStyle { label: string; bg: string; border: string; fg: string }
export interface TrpgSettings {
  statuses: Record<DotoriStatus, DotoriStatusStyle>;
}
export const DEFAULT_TRPG_SETTINGS: TrpgSettings = {
  statuses: {
    // 기존 하드코딩 뱃지 색 계승 (pledge: 반투명 잉크 → hex 근사 / confirmed: 포인트 레드)
    pledge: { label: '공수표', bg: '#23262b', border: '#b9bdc4', fg: '#ffffff' },
    undecided: { label: '일정 미정', bg: '#7a8089', border: '#7a8089', fg: '#ffffff' },
    confirmed: { label: '일정 확정', bg: '#a63a45', border: '#a63a45', fg: '#ffffff' },
    done: { label: '완', bg: '#3c434d', border: '#3c434d', fg: '#ffffff' },
  },
};

export const DOTORI_STATUS_KEYS: DotoriStatus[] = ['pledge', 'undecided', 'confirmed', 'done'];

/** 도토리 상태 뱃지 스타일 (카드 우상단 — 공수표/일정 확정만 표시) */
export function dotoriBadgeStyle(st: DotoriStatusStyle): CSSProperties {
  return { background: st.bg, border: `1px solid ${st.border}`, color: st.fg };
}

const TRPG_SET_KEY = 'ohome.trpgset.v1';

export function useTrpgSettings(): [TrpgSettings, (patch: Partial<TrpgSettings>) => void, boolean] {
  const [st, setSt] = useState<TrpgSettings>(DEFAULT_TRPG_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(TRPG_SET_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<TrpgSettings>;
        setSt({ statuses: { ...DEFAULT_TRPG_SETTINGS.statuses, ...(p.statuses ?? {}) } });
      }
    } catch { /* 기본값 */ }
    setLoaded(true);
  }, []);
  const patch = useCallback((p: Partial<TrpgSettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(TRPG_SET_KEY, n); } catch { /* 무시 */ }
      return n;
    });
  }, []);
  return [st, patch, loaded];
}

export interface DotoriItem {
  id: string;
  name: string;              // 시나리오 이름 (필수)
  writer: string;            // 라이터
  rule: string;              // 룰(시스템)
  people: string;            // 인원 표기
  tags: string[];            // 태그 (복수)
  link?: string;             // 판매처/소개 페이지
  status: DotoriStatus;      // 카드에서 바로 전환
  imgId?: string;            // 16:9 이미지 (IndexedDB)
  thumbCrop?: CropValue;
  ph: string;                // 이미지 없을 때 플레이스홀더
  date: string;              // 등록일 ISO (정렬용)
}

export const DOTORI_SEED: DotoriItem[] = [];

/* ---------- TRPG 플레이기록 (4.16) — 표 형식 ---------- */
export interface PlayRecord {
  id: string;
  date?: string;             // Date (optional — 비우면 표 맨 아래)
  scenario: string;          // Scenario (필수)
  scenarioLink?: string;     // 시나리오 링크 — 표에서 이름 클릭 시 새 탭
  writer: string;
  withText: string;          // With
  role: string;              // PL·GM·HO1 등 짧은 표기
  playtime: string;          // 4h 30m 등 자유 표기
  url?: string;              // Url (optional) — 클립 아이콘, 새 탭
  logId?: string;            // 내 홈 로그 백업 연결 (모바일: Playtime 밑줄)
}

export const PLAYLOG_SEED: PlayRecord[] = [];

export const TRPG_SEED: TrpgLog[] = [];
