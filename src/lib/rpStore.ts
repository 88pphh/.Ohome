'use client';
// 역극 (4.9) — 실시간 채팅형. 현재는 localStorage 단계(같은 브라우저 내 동작 확인용)이며
// 실시간 송수신·입력 중 표시·참여자 전원 동의 흐름은 Supabase Realtime 연동 시 활성화.
export interface RpMessage {
  id: string;
  kind: 'char' | 'desc' | 'player'; // 캐릭터 발화 / 지문(가운데 서술) / 플레이어 본인 발화
  charId?: string;                  // kind==='char'일 때 발화 캐릭터
  charOwn?: boolean;                // 발화 당시 내 캐릭터(자캐)였는지 — 삭제된 캐릭터 재연동 시 리스트 판별용
  authorId: string;                 // 작성 회원 (수정/삭제 권한)
  text: string;
  date: string;                     // ISO
}

export interface RpRoom {
  id: string;
  title: string;
  relId?: string;                   // 기반 자관 (선택 — 자유 개설 가능)
  memberIds: string[];              // 참여 회원 — 이 목록에 없으면 방의 존재 자체가 보이지 않음 (확정)
  status: 'ongoing' | 'done';       // 진행중 / 완결
  isPublic: boolean;                // 완결 후 공개 전환 (자관 역극 리스트로 열람)
  createdBy: string;
  created: string;
  lastRead: Record<string, string>; // 회원별 마지막 확인 시각 — N 뱃지
  messages: RpMessage[];
}

/** hex → "r,g,b" (말풍선 저알파 배경용 — 6장 말풍선 색상 규칙) */
export function hexRgb(hex?: string): string {
  const h = (hex ?? '#5d636d').replace('#', '');
  const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return `${parseInt(f.slice(0, 2), 16) || 93},${parseInt(f.slice(2, 4), 16) || 99},${parseInt(f.slice(4, 6), 16) || 109}`;
}

/** 방의 마지막 메시지 시각 (없으면 개설 시각) */
export const rpLastDate = (r: RpRoom) =>
  r.messages.length ? r.messages[r.messages.length - 1].date : r.created;

/** 안 읽은 새 메시지 여부 (내가 마지막으로 본 뒤에 남이 쓴 메시지) */
export function rpHasNew(r: RpRoom, userId: string): boolean {
  const seen = r.lastRead[userId] ?? '';
  return r.messages.some(m => m.authorId !== userId && m.date > seen);
}

/* ---------- 시드 (프로토타입 데모 계승 — admin·guest 참여) ---------- */
export const RP_SEED: RpRoom[] = [];
