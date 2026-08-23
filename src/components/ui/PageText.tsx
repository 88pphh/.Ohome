'use client';
// 페이지 타이틀/설명 문구 편집 (5.2) — 관리자가 각 페이지 상단 설명을 자유 수정
// 호버 시 좌우반전 연필(✎)이 표시되고, 클릭하면 그 자리에서 입력 (localStorage → DB 이전 예정)
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useMenuSettings, pageTitleFor } from '@/lib/menuStore';
import { refreshPage } from '@/lib/pageRefresh';
import { getRawSetting, setSetting } from '@/lib/settingStore';

const STORAGE_KEY = 'ohome.pagetext.v1';

/** 페이지 상단 대제목 — 클릭하면 해당 메뉴의 초기 페이지로 이동 (기본: 경로 첫 세그먼트).
 *  메뉴 관리에서 페이지 타이틀을 지정했으면 그 값이 기본 텍스트를 대체 (5.2 v1.9) —
 *  키는 href prop(게시판 등) 또는 현재 경로가 기능 href와 정확히 일치할 때만 (하위 경로 무영향) */
export function PageTitle({ children, href, style }: {
  children: React.ReactNode; href?: string; style?: React.CSSProperties;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ms] = useMenuSettings();
  const target = href ?? `/${pathname.split('/')[1] ?? ''}`;
  const custom = pageTitleFor(ms, href ?? pathname);
  // 지금 있는 페이지면 다시 불러오기 — 상단 메뉴 재클릭과 동일 동작 (v1.9 사용자 요청)
  return (
    <h1 style={style} onClick={() => {
      const t = target || '/';
      if (t === pathname) refreshPage();   // 새로고침 아님 — 페이지만 처음 상태로 (v1.9)
      else router.push(t);
    }}>
      {custom ?? children}
    </h1>
  );
}

function load(): Record<string, string> {
  try { return JSON.parse(getRawSetting(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}

/** 페이지 문구 직접 읽기/쓰기 — 환경설정 등 다른 화면에서 편집할 때 (v1.9) */
export function getPageText(k: string, def: string): string {
  const v = load()[k];
  return v !== undefined ? v : def;
}
export function setPageText(k: string, v: string) {
  const map = load();
  if (v.trim()) map[k] = v; else delete map[k];
  try { setSetting(STORAGE_KEY, map); } catch { /* 무시 */ }
}

/** always — 헤더 표시 옵션(제목만/안 띄움)에도 숨지 않는 상태·안내 문구용 (예: 역극 비로그인 안내, v1.9) */
export function EditableDesc({ k, def, always }: { k: string; def: string; always?: boolean }) {
  const { isAdmin } = useAuth();
  const [text, setText] = useState(def);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const v = load()[k];
    setText(v !== undefined ? v : def); // 키 변경 시(다른 캐릭터 등) 기본값으로 리셋
  }, [k, def]);

  const save = () => {
    const v = draft.trim();
    const map = load();
    if (v) map[k] = v; else delete map[k];
    try { setSetting(STORAGE_KEY, map); } catch { /* 무시 */ }
    setText(v || def);
    setEditing(false);
  };

  if (editing) {
    // 보기(p)와 동일한 크기·여백의 심리스 인풋 — 전환 시 레이아웃이 덜컹거리지 않음
    return (
      <input
        autoFocus
        className="desc-edit"
        defaultValue={text}
        onChange={e => setDraft(e.target.value)}
        onFocus={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    // .editable — 관리자 연필 표시는 이 클래스에만 (동적 메타 문구에는 연필 없음)
    <p className={`editable${always ? ' gate' : ''}`} onClick={() => { if (isAdmin) { setDraft(text); setEditing(true); } }}>
      {text}
    </p>
  );
}
