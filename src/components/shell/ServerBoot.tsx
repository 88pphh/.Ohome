'use client';
// 서버 연결 부팅 (v2.0) — 앱이 그려지기 전에 런타임 설정(ohome.config.json → localStorage → env)을
// 한 번 읽어 Supabase 클라이언트를 확정한다. 확정 전에는 자식을 그리지 않아
// "로컬 모드로 한 번 그렸다가 서버 모드로 다시 그리는" 깜빡임을 막는다.
import React, { useEffect, useState } from 'react';
import { initSupabase } from '@/lib/supabase';
import { primeSettings } from '@/lib/settingStore';

export function ServerBoot({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    // 백엔드 확정 → 사이트 설정(테마·메뉴·폰트…)을 한 번에 받아 캐시 → 그 다음에 화면을 그린다.
    // 각 스토어가 렌더 중 동기적으로 설정을 읽기 때문에 순서가 중요하다.
    initSupabase()
      .then(() => primeSettings())
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  if (!ready) return null;
  return <>{children}</>;
}
