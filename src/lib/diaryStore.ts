// 다이어리 (4.14) — 무드 일기 + 무드 리스트 (환경설정 관리)
import type { Visibility } from './charStore';

/* ---------- 무드 (5.2 — 환경설정에서 이름/아이콘/색 관리) ---------- */
export interface Mood {
  id: string;
  name: string;
  icon: string;      // 이모지/특수문자 1~2자
  color: string;     // 아이콘 색 (배경은 자동 틴트)
}

export const MOOD_SEED: Mood[] = [
  { id: 'm1', name: '후련함', icon: '☀', color: '#b39b6b' },
  { id: 'm2', name: '차분함', icon: '☂', color: '#4c6a8e' },
  { id: 'm3', name: '설렘', icon: '♥', color: '#a63a45' },
  { id: 'm4', name: '피곤함', icon: '☾', color: '#6b7280' },
];

/* ---------- 일기 ---------- */
export interface DiaryPost {
  id: string;
  title: string;
  date: string;              // YYYY-MM-DD
  moodId: string;
  body: string;              // MD
  imgIds: string[];          // 첨부 이미지 (IndexedDB)
  visibility: Visibility;
}

export const DIARY_SEED: DiaryPost[] = [];

/** hex(#rrggbb) → 옅은 틴트 배경 (아이콘 원 배경용) */
export const moodTint = (hex: string) => /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}26` : 'rgba(127,127,127,.15)';
