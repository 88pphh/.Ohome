'use client';
/**
 * 인트로(소개) 페이지 (v2.0 사용자 요청) — **에디터로 쓰고, 글 하나만 보이는 페이지.**
 *
 * 목록·댓글·말머리가 없다. 본문 하나뿐이라 글 테이블이 아니라 설정 한 칸에 담고(introStore),
 * 수정도 별도 화면으로 넘기지 않고 **이 자리에서** 한다 — 글이 하나뿐인데 목록↔쓰기로
 * 오가는 것은 번거롭기만 하다. 큰 제목·설명 문구는 다른 페이지와 똑같이 메뉴 관리에서 바꾼다.
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useIntro } from '@/lib/introStore';
import { RichEditor } from '@/components/ui/RichEditor';
import { HtmlBody } from '@/components/ui/HtmlBody';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { useToast } from '@/components/ui/Toast';

export default function IntroPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [doc, save, loaded] = useIntro();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  // 저장본이 늦게 도착해도(서버 모드) 편집 중이 아니면 화면 값을 맞춰 둔다
  useEffect(() => { if (!editing) setDraft(doc.html); }, [doc.html, editing]);

  const start = () => { setDraft(doc.html); setEditing(true); };
  const done = () => {
    save({ html: draft });
    setEditing(false);
    toast('저장되었습니다');
  };

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>INTRO</PageTitle>
        <EditableDesc k="intro-desc" def="이 홈에 대한 소개" />
        {isAdmin && (
          <div className="head-actions">
            {editing ? (
              <>
                <button className="btn btn-dark" onClick={done}>SAVE</button>
                <button className="btn btn-ghost" onClick={() => { setDraft(doc.html); setEditing(false); }}>CANCEL</button>
              </>
            ) : (
              <button className="btn btn-dark" onClick={start}>✎ EDIT</button>
            )}
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: 26 }}>
        {editing
          ? <RichEditor value={draft} onChange={setDraft} />
          /* 저장본이 아직 안 왔을 때 「비어 있습니다」가 잠깐 스치지 않게 loaded를 본다 */
          : loaded && !doc.html.trim()
            ? (
              <p className="hint" style={{ margin: 0, textAlign: 'center', padding: '38px 0' }}>
                {isAdmin ? '아직 비어 있습니다 — 오른쪽 위 EDIT으로 소개를 작성해 주세요' : '아직 준비 중입니다'}
              </p>
            )
            : <HtmlBody html={doc.html} className="html-body" />}
      </div>
    </section>
  );
}
