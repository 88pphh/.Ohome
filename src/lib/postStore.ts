'use client';
// 게시판·방명록 타입 + 공용 목록 저장소 훅
// v2.0: 서버(Supabase) 연결이 있으면 DB, 없으면 localStorage — 화면 코드는 동일하다.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PostMode } from './sanitize';
import { isServerMode } from './supabase';
import { TABLE_OF, fetchList, syncList, subscribeTable } from './db';
import { currentUserId } from './currentUser';

export interface Comment {
  id: string;
  author: string;
  authorId: string;      // 게스트 댓글은 '' (방문자 권한 — 4.10/5.2)
  text: string;
  date: string;          // ISO
  parentId?: string;     // 대댓글
  guestPw?: string;      // 게스트 본인 수정·삭제용 (mock — 실서비스는 서버 해시)
}

export type FoldType = 'spoiler' | 'adult' | 'custom';

export interface Post {
  id: string;
  title: string;
  body: string;
  mode: PostMode;        // 렌더 방식 (md / html)
  /** 무엇으로 썼는지 (v2.0) — 에디터로 쓴 글을 수정할 때 HTML 소스가 뜨지 않게 기억한다.
   *  렌더는 mode로 하고, 이 값은 수정 화면을 어떤 모드로 열지에만 쓴다. */
  authored?: 'editor';
  category: string;      // 말머리
  author: string;
  authorId: string;
  date: string;          // ISO
  secret: boolean;       // 비밀글
  notice: boolean;       // 공지 고정
  fold: { type: FoldType; label?: string } | null; // 스포일러/수위 접기 (6.2)
  comments: Comment[];
  boardId?: string;      // 소속 게시판 (5.2 다중 게시판 — 없으면 기본 'main')
  thumbSrc?: string;     // 티켓 스킨 대표 이미지 — 본문에 삽입한 이미지 중 선택 (v1.9)
  thumbCrop?: { x: number; y: number; scale: number };  // 대표 썸네일 크롭 (16:9)
}

export interface GuestEntry {
  id: string;
  author: string;
  authorId?: string;      // 로그인 회원이면
  guestPw?: string;       // 게스트 작성 시 본인 수정·삭제용 (mock — 실서비스는 서버 해시)
  body: string;
  secret: boolean;
  date: string;
  reply?: { author: string; text: string; date: string } | null; // 관리자 답글
}

export const BOARD_CATEGORIES = ['잡담', '설정', '합작', '기타'];

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** 목록 저장소 훅 — 서버 모드면 DB, 아니면 localStorage (v2.0)
 *
 *  화면 코드는 예전 그대로 `[목록, 통째로 저장, 로드완료]`를 쓴다.
 *  서버 모드에서는 저장할 때 이전/새 배열을 비교해 바뀐 행만 insert/update/delete 하고,
 *  다른 사람의 변경은 실시간 구독으로 받아 온다. (로컬 모드는 storage 이벤트로 탭 간 동기화)
 */
export function useLocalList<T extends { id?: string }>(key: string, seed: T[]): [T[], (next: T[]) => void, boolean] {
  const [list, setList] = useState<T[]>(seed);
  const [loaded, setLoaded] = useState(false);
  const server = isServerMode() && !!TABLE_OF[key];
  const table = TABLE_OF[key];
  const latest = useRef<T[]>(seed);          // diff 기준이 되는 "DB에 있다고 아는" 상태
  latest.current = list;

  useEffect(() => {
    let alive = true;
    if (server) {
      const load = () => {
        fetchList<T & { id: string }>(table)
          .then(rows => { if (alive) { setList(rows); latest.current = rows; setLoaded(true); } })
          .catch(() => { if (alive) setLoaded(true); });
      };
      load();
      const off = subscribeTable(table, load);   // 다른 사람이 쓰면 바로 반영
      return () => { alive = false; off(); };
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw) setList(JSON.parse(raw));
    } catch { /* 시드 유지 */ }
    setLoaded(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue == null) return;
      try { setList(JSON.parse(e.newValue)); } catch { /* 무시 */ }
    };
    window.addEventListener('storage', onStorage);
    return () => { alive = false; window.removeEventListener('storage', onStorage); };
  }, [key, server, table]);

  const update = useCallback((next: T[]) => {
    const prev = latest.current;
    setList(next);            // 낙관적 반영 — 화면은 즉시 바뀐다
    latest.current = next;
    if (server) {
      syncList(table, prev as unknown as { id: string }[], next as unknown as { id: string }[], currentUserId())
        .catch(err => {
          // 실패하면 서버 상태로 되돌려 화면과 DB가 어긋난 채로 남지 않게
          console.error('[ohome] 저장 실패', err);
          fetchList<T & { id: string }>(table)
            .then(rows => { setList(rows); latest.current = rows; })
            .catch(() => { /* 무시 */ });
        });
      return;
    }
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* 무시 */ }
  }, [key, server, table]);

  return [list, update, loaded];
}

/* ---------- 시드 (데모) ---------- */
export const BOARD_SEED: Post[] = [];

export const GUEST_SEED: GuestEntry[] = [];

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
