'use client';
// 커미션 등록 (4.18) — 페이지형
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId } from '@/lib/postStore';
import { CommItem, COMM_SEED, useCommSettings } from '@/lib/commStore';
import { CommForm } from '@/components/comm/CommForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

export default function CommNewPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [items, setItems] = useLocalList<CommItem>('ohome.comm.v1', COMM_SEED);
  const [settings] = useCommSettings();

  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>COMMISSION</PageTitle><p>관리자 전용 페이지</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle>ADD COMMISSION</PageTitle><EditableDesc k="comm-new-desc" def="커미션 등록" /></div>
      <CommForm initial={null} settings={settings}
        onCancel={() => router.push('/comm')}
        onSave={v => {
          const c: CommItem = { id: newId(), ...v, ph: 'cool', date: new Date().toISOString() };
          setItems([c, ...items]);
          toast('커미션이 등록되었습니다');
          router.push(`/comm/${c.id}`);
        }} />
    </section>
  );
}
