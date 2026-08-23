'use client';
// 캐릭터 등록 페이지 (4.4) — 전용 페이지 (모달 아님)
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Character, CHAR_SEED } from '@/lib/charStore';
import { CharEditForm } from '@/components/chars/CharEditForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

export default function CharNewPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [chars, setChars, loaded] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);

  if (!loaded) return <section className="page" />;
  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>ADD CHARACTER</PageTitle><p>관리자 전용</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>ADD CHARACTER</PageTitle>
        <EditableDesc k="chars-new-desc" def="캐릭터 등록 — 아트 첫 장이 대표 · 탭 내용은 전용 편집 화면에서 작성" />
      </div>
      <CharEditForm
        initial={null}
        existingIds={chars.map(c => c.id)}
        onCancel={() => router.push('/chars')}
        onSave={c => {
          setChars([...chars, c]);
          toast('캐릭터가 등록되었습니다');
          router.push(`/chars/${c.id}`);
        }}
      />
    </section>
  );
}
