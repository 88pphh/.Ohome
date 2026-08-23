'use client';
// 자관 수정 페이지 (4.5) — 이름/캐치프레이즈/유형/공개범위/폰트/썸네일. 멤버는 상세에서.
// ?au=<AU id> 로 진입하면 그 AU의 일러·캐치프레이즈를 편집 (v1.9 — AU 선택 상태에서 EDIT)
import React, { Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Character, CHAR_SEED, Relation, REL_SEED } from '@/lib/charStore';
import { RelForm } from '@/components/rels/RelForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

function RelEditInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const auId = params.get('au') ?? undefined;
  const [rels, setRels, loaded] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);

  const rel = rels.find(r => r.id === id);
  const auObj = auId ? rel?.aus.find(a => a.id === auId && a.id !== 'base') : undefined;
  if (!loaded) return <section className="page" />;
  if (!isAdmin || !rel) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>EDIT</PageTitle><p>{!rel ? '자관을 찾을 수 없습니다' : '관리자 전용'}</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>EDIT — {rel.name}{auObj ? ` · ${auObj.label}` : ''}</PageTitle>
        <EditableDesc k="rels-edit-desc" def="자관 정보 수정 — 멤버·타임라인·문답·AU는 상세 페이지에서 관리합니다" />
      </div>
      <RelForm
        initial={rel}
        auId={auObj?.id}
        myChars={chars.filter(c => c.own)}
        memberNames={Object.fromEntries(rel.members.map(m => [m.charId, chars.find(c => c.id === m.charId)?.name ?? m.charId]))}
        onCancel={() => router.push(`/rels/${rel.id}`)}
        onSave={v => {
          setRels(rels.map(r => (r.id === rel.id ? {
            ...r,
            name: v.name, kind: v.kind,
            fontId: v.fontId, bodyFontId: v.bodyFontId, visibility: v.visibility,
            // 헤더는 AU 편집이면 그 AU에만 저장 — base 헤더는 유지 (v1.9 AU별 헤더 분리)
            ...(auObj ? {} : { headerImgId: v.headerImgId, headerCrop: v.headerCrop }),
            // 페이지 테마 — AU 편집이면 그 AU에만 (base 테마는 유지, v1.9)
            ...(auObj ? {} : { themeMode: v.themeMode, themeColor: v.themeColor, themeTone: v.themeTone, illuBg: v.illuBg, illuOn: v.illuOn, nameColor: v.nameColor, cpColor: v.cpColor }),
            cp: v.cp,
            fullFront: v.fullFront ?? r.fullFront,
            illustMode: v.kind === 'pair' ? r.illustMode : 'one',
            // 전신 크기·위치(공통) — 미리보기 조작 결과 (v1.9)
            members: (v.fullScales || v.fullOffsets || v.quoteColors)
              ? r.members.map(m => ({
                ...m,
                fullScale: v.fullScales?.[m.charId] ?? m.fullScale,
                fullOffX: v.fullOffsets?.[m.charId]?.x ?? m.fullOffX,
                fullOffY: v.fullOffsets?.[m.charId]?.y ?? m.fullOffY,
                quoteColor: v.quoteColors?.[m.charId]?.fg ?? m.quoteColor,
                quoteMarkColor: v.quoteColors?.[m.charId]?.mark ?? m.quoteMarkColor,
              }))
              : r.members,
            // AU 편집 모드 — 아트·캐치프레이즈·전신은 그 AU에만 (원본 것은 유지)
            ...(auObj
              ? {
                aus: r.aus.map(a => (a.id === auObj.id ? {
                  ...a, arts: v.arts, catchphrase: v.catchphrase,
                  // AU별 헤더 (v1.9) — 제거하면 "없음 명시"(null): base 헤더로 되돌아가지 않음
                  headerImgId: v.headerRemoved ? undefined : v.headerImgId,
                  headerCrop: v.headerRemoved ? undefined : v.headerCrop,
                  // AU별 페이지 테마 — 기존 따라가기면 미지정 (v1.9)
                  theme: v.themeFollow ? undefined : { mode: v.themeMode, color: v.themeColor, tone: v.themeTone },
                  fulls: v.fulls
                    ? Object.fromEntries(Object.entries(v.fulls).filter(([, id2]) => id2) as [string, string][])
                    : a.fulls,
                } : a)),
              }
              : {
                catchphrase: v.catchphrase, arts: v.arts, thumbId: v.arts[0], thumbCrop: v.thumbCrop,
                ...(v.fulls
                  ? {
                    members: r.members.map(m => ({
                      ...m, fullImgId: v.fulls![m.charId],
                      fullScale: v.fullScales?.[m.charId] ?? m.fullScale,
                      fullOffX: v.fullOffsets?.[m.charId]?.x ?? m.fullOffX,
                      fullOffY: v.fullOffsets?.[m.charId]?.y ?? m.fullOffY,
                      quoteColor: v.quoteColors?.[m.charId]?.fg ?? m.quoteColor,
                      quoteMarkColor: v.quoteColors?.[m.charId]?.mark ?? m.quoteMarkColor,
                    })),
                  }
                  : {}),
              }),
          } : r)));
          toast('저장되었습니다');
          router.push(`/rels/${rel.id}`);
        }}
      />
    </section>
  );
}

export default function RelEditPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><RelEditInner /></Suspense>;
}
