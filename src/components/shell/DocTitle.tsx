'use client';
// 브라우저 탭 제목 (v1.9 사용자 요청) — 디자인 탭에서 지정, 비우면 「로고 텍스트 — 개인홈」
import { useEffect } from 'react';
import { useSiteSettings } from '@/lib/siteStore';

export function DocTitle() {
  const [site, , loaded] = useSiteSettings();
  useEffect(() => {
    if (!loaded) return;
    const t = site.docTitle?.trim() || `${site.title} — 개인홈`;
    document.title = t;
  }, [loaded, site.docTitle, site.title]);
  return null;
}
