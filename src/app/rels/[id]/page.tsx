'use client';
// 자관 상세 (4.5) — 2인: 헤더 블러 + 대형 타이틀 + 좌우 카드 + 중앙 일러(전신/일러 토글) + AU
// 하단: TIMELINE / QUESTIONS 탭 (v1.8) + 역극·로그 연동 리스트 · 다인(3인+): 멤버 리스트형
// 관리자: 멤버 추가(내/상대 캐릭터) · 타임라인 항목 추가 · 질문 추가
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/ThemeProvider';
import { useLocalList, newId } from '@/lib/postStore';
import {
  Relation, REL_SEED, Character, CHAR_SEED, RelMember, QaEntry, QaAnswer, TlItem, findChar, Visibility, CharGrant,
  RelAu, RelCpTag, charWithAu, charGrant,
} from '@/lib/charStore';
import { RelQuestionSet, RELQ_SEED, RELQ_KEY, CP_LABEL } from '@/lib/relqStore';
import { putBlob } from '@/lib/blobStore';
import { GrantsEditor } from '@/components/chars/GrantsEditor';
import { TrpgLog, TRPG_SEED } from '@/lib/galleryStore';
import { RpRoom, RP_SEED } from '@/lib/rpStore';
import { useFonts } from '@/lib/fontStore';
import { Tip, KInput, KTextarea, KSelect, KRadio } from '@/components/ui/Kit';
import { Modal, ConfirmModal, useConfirmDelete } from '@/components/ui/Modal';
import { ColorField } from '@/components/ui/ColorField';
import { DragList } from '@/components/ui/DragList';
import { BlobImg, useBlobUrl } from '@/lib/blobStore';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';

/** 전신 이미지 — 비율 유지, 하단 정렬, 크기 %는 자관 수정 미리보기에서 지정 (v1.9) */
function FullImg({ refId, scale, offX = 0, offY = 0 }: { refId: string; scale: number; offX?: number; offY?: number }) {
  const url = useBlobUrl(refId);
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" draggable={false} style={{
      position: 'absolute', bottom: `${offY}%`, left: `calc(50% + ${offX}%)`, transform: 'translateX(-50%)',
      height: `${scale}%`, maxWidth: 'none',
      filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.35))',
    }} />
  );
}

/** hex → "r,g,b" (말풍선 --cc 용) */
function rgbTriple(hex: string): string {
  const m = hex.replace('#', '');
  const f = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  return `${parseInt(f.slice(0, 2), 16)},${parseInt(f.slice(2, 4), 16)},${parseInt(f.slice(4, 6), 16)}`;
}

function MiniProf({ member, char, isAdmin, onGo, onRemove, auUnregistered }: {
  member: RelMember; char?: Character; isAdmin: boolean; onGo: () => void; onRemove: () => void;
  auUnregistered?: boolean;   // AU 선택 중인데 이 캐릭터의 AU 프로필이 미등록 (v1.9)
}) {
  if (!char) return null;
  if (auUnregistered) {
    return (
      <div className="panel mini-prof" onClick={onGo} style={{ cursor: 'var(--cur-pointer,pointer)', textAlign: 'center', padding: '44px 20px' }}>
        <b style={{ fontSize: 15, letterSpacing: '.08em' }}>{char.name}</b>
        <p className="hint" style={{ marginTop: 10 }}>이 AU의 프로필이 아직 등록되지 않았습니다<br />카드를 누르면 캐릭터 페이지에서 등록할 수 있습니다</p>
      </div>
    );
  }
  return (
    <div className="panel mini-prof" onClick={onGo} style={{ cursor: 'var(--cur-pointer,pointer)' }}>
      <div className="hd">
        <div className={`face ph ${char.thumbClass}`} />
        <div>
          <b>{char.name}</b>
          <small>{char.sub}{member.linkedNote ? ` · ${member.linkedNote}` : ''}</small>
        </div>
      </div>
      <div className="specs">
        {char.specs.map(s => <div key={s.label}><b>{s.label}</b> {s.value}</div>)}
      </div>
      <div className="palette-row" data-tip="캐릭터 테마색 팔레트">
        {member.palette.map(p => (
          <Tip key={p.hex + p.label} tip={p.label}>
            <span className="gem" style={{ background: p.hex }} />
          </Tip>
        ))}
      </div>
      <div className="kw-row">
        {member.keywords.map(k => <span key={k} className="pill">{k}</span>)}
      </div>
      {member.desc && <div className="rel-desc">{member.desc}</div>}
      <div className="card-thumbs">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`t ph ${char.thumbClass}`}>{i === 0 && <span style={{ fontSize: 8 }}>SD</span>}</div>
        ))}
      </div>
      <div className="foot">
        <span>{char.name}</span>
        <span>
          ID {char.id}
          {isAdmin && (
            <span style={{ marginLeft: 8, cursor: 'var(--cur-pointer,pointer)', color: 'var(--accent)' }}
              onClick={e => { e.stopPropagation(); onRemove(); }}>멤버 제거</span>
          )}
        </span>
      </div>
    </div>
  );
}

/** 페어에서 멤버가 비었을 때 자리 카드 */
function EmptyCard({ isAdmin, onAdd }: { isAdmin: boolean; onAdd: () => void }) {
  return (
    <div className="panel mini-prof" style={{
      display: 'grid', placeItems: 'center', minHeight: 320,
      border: '2px dashed var(--line)', background: 'rgba(252,252,253,.6)', cursor: isAdmin ? 'pointer' : undefined,
    }} onClick={() => { if (isAdmin) onAdd(); }}>
      <div style={{ textAlign: 'center', color: 'var(--faint)', fontSize: 12.5, padding: 20 }}>
        {isAdmin ? <><b style={{ fontSize: 20, display: 'block', marginBottom: 6 }}>＋</b>멤버 추가<br /><small>내 캐릭터 또는 상대 캐릭터</small></> : '멤버 미정'}
      </div>
    </div>
  );
}

export default function RelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const { familyOf } = useFonts();
  const [rels, setRels, loaded] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [chars, setChars, charsLoaded] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [logs] = useLocalList<TrpgLog>('ohome.trpg.v1', TRPG_SEED);
  const [rooms] = useLocalList<RpRoom>('ohome.rp.v1', RP_SEED);
  const [tab, setTab] = useState<'tl' | 'qa'>('tl');
  const [auId, setAuId] = useState('base');
  const [oneMode, setOneMode] = useState<boolean | null>(null);
  const [qaNo, setQaNo] = useState<number | null>(null);
  const [qaQuery, setQaQuery] = useState('');
  const [qaText, setQaText] = useState('');
  // 답변 수정·오너 부연 모달 (v1.9) — 훅은 early return 앞에
  const [ansEdit, setAnsEdit] = useState<{ qNo: number; idx: number; text: string; note: string } | null>(null);
  const [qaChar, setQaChar] = useState<string | null>(null);
  // 다인관 — 입력 캐릭터 드롭다운 (v1.9): body 포털(fixed)로 위에 표시 — qa-today 스크롤 영역에 잘리지 않게
  const [qaPickPos, setQaPickPos] = useState<{ left: number; top: number } | null>(null);
  // 관리자 추가 모달
  const [memberOpen, setMemberOpen] = useState(false);
  const [mMode, setMMode] = useState<'exist' | 'new'>('exist');
  const [mCharId, setMCharId] = useState('');
  const [mQuery, setMQuery] = useState('');   // 기존 캐릭터 검색어
  const [mQuote, setMQuote] = useState('');
  const [mName, setMName] = useState('');
  const [mSub, setMSub] = useState('');
  const [mColor, setMColor] = useState('#8a7f70');
  const [mGrants, setMGrants] = useState<CharGrant[]>([]); // 새 상대 캐릭터 회원 권한 (v1.9)
  const [tlOpen, setTlOpen] = useState(false);
  const [tEra, setTEra] = useState('');
  const [tDesc, setTDesc] = useState('');
  // 한마디는 핑퐁식으로 여러 개 (사용자 요청)
  const [tSays, setTSays] = useState<{ id: string; charId: string; text: string }[]>([]);
  const [tlSort, setTlSort] = useState(false); // 타임라인 정렬 모드 (드래그앤드롭)
  const [artIdx, setArtIdx] = useState(0);
  const [qOpen, setQOpen] = useState(false);
  const [qText, setQText] = useState('');
  const [auOpen, setAuOpen] = useState(false);
  const [auLabel, setAuLabel] = useState('');
  const [auCatch, setAuCatch] = useState('');
  const [auCp, setAuCp] = useState<RelCpTag>('cp');       // 새 AU의 CP/NCP (v1.9)
  const [qsets] = useLocalList<RelQuestionSet>(RELQ_KEY, RELQ_SEED); // 자관 질문 세트 (환경설정)
  const [qsetOpen, setQsetOpen] = useState(false);        // QUESTIONS 섹션 추가 — 질문 리스트 선택 모달
  const [delAsk, setDelAsk] = useState(false);   // 자관 삭제 확인
  const del = useConfirmDelete();                // 멤버·타임라인 등 개별 삭제 확인

  const rel = rels.find(r => r.id === id);

  // 자관별 페이지 테마 (4.18 방식) — 별도 테마컬러면 홈 전체 팔레트를 임시 전환, 벗어나면 원복.
  // AU별 (v1.9): AU에 테마를 지정했으면 그것, 미지정이면 base(원본) 테마 따라가기
  const { setPageTheme } = useTheme();
  const themeAu = rel?.aus.find(a => a.id === auId);
  const auTheme = themeAu && themeAu.id !== 'base' ? themeAu.theme : undefined;
  const effThemeMode = auTheme?.mode ?? rel?.themeMode;
  const effThemeColor = auTheme ? auTheme.color : rel?.themeColor;
  const pageColor = effThemeMode === 'custom' && effThemeColor ? effThemeColor : null;
  const pageTone = auTheme ? auTheme.tone : rel?.themeTone;
  useEffect(() => {
    setPageTheme(pageColor, pageTone);
    return () => setPageTheme(null);
  }, [pageColor, pageTone, setPageTheme]);

  // 삭제된 캐릭터를 가리키는 멤버 자동 정리 — 카드도 안 뜨고 [＋ 멤버 추가]도
  // 안 나오는 유령 슬롯이 남지 않게 (캐릭터 삭제 기능 도입에 따른 정합성 보정)
  useEffect(() => {
    if (!loaded || !charsLoaded || !rel) return;
    const alive = rel.members.filter(m => chars.some(c => c.id === m.charId));
    if (alive.length !== rel.members.length) {
      setRels(rels.map(r => (r.id === rel.id ? { ...r, members: alive } : r)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, charsLoaded, rel?.id, rel?.members.length, chars.length]);

  const isDuo = rel ? (rel.kind ? rel.kind === 'pair' : rel.members.length === 2) : false;
  const au = rel?.aus.find(a => a.id === auId) ?? rel?.aus[0];
  // AU별 프로필 데이터 (v1.9) — base(원본)는 Relation 최상위, 그 외 AU는 aus 항목에 저장
  const isBaseAu = (au?.id ?? 'base') === 'base';
  const auArts = (isBaseAu ? rel?.arts : au?.arts) ?? [];
  const auTimeline = (isBaseAu ? rel?.timeline : au?.timeline) ?? [];
  const auQuestions = (isBaseAu ? rel?.questions : au?.questions) ?? [];
  const auQaPool = (isBaseAu ? rel?.qaPool : au?.qaPool) ?? [];   // 대기 질문 풀 (v1.9)
  const auCpTag: RelCpTag | undefined = au?.cp ?? rel?.cp;
  const qaOn = (isBaseAu ? rel?.qaEnabled : au?.qaEnabled) ?? auQuestions.length > 0;
  const curQa: QaEntry | undefined = auQuestions.find(q => q.no === (qaNo ?? auQuestions[0]?.no));
  const single = oneMode ?? rel?.illustMode === 'one';

  // 멤버 캐릭터 — AU 선택 시 그 캐릭터의 AU 프로필(이름·사진 등)로 합성해 표시 (v1.9)
  const auCharKey = rel && !isBaseAu && au ? `${rel.id}:${au.id}` : null;
  const charOf = (cid: string) => {
    const c = findChar(chars, cid);
    return c && auCharKey ? charWithAu(c, auCharKey) : c;
  };
  // AU 선택 중 그 캐릭터의 AU 프로필 미등록 여부 + 캐릭터 페이지 링크(au 유지) (v1.9)
  const auUnregOf = (cid: string) => !!auCharKey && !findChar(chars, cid)?.auProfiles?.[auCharKey];
  const charHref = (cid: string) => (auCharKey ? `/chars/${cid}?au=${encodeURIComponent(auCharKey)}` : `/chars/${cid}`);
  const sideOf = (cid: string) => (isDuo && rel?.members[1]?.charId === cid ? 'r' : 'l');

  // AU 전환으로 QUESTIONS 섹션이 없는 AU에 오면 타임라인 탭으로 (v1.9)
  useEffect(() => { if (!qaOn && tab === 'qa') setTab('tl'); }, [qaOn, tab]);

  const qaFiltered = useMemo(
    () => auQuestions.filter(q => !qaQuery || q.q.includes(qaQuery) || String(q.no).includes(qaQuery)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rel, auId, qaQuery],
  );
  const relLogs = useMemo(() => logs.filter(l => l.relId === rel?.id), [logs, rel]);
  // 역극 연동 (4.9) — 내가 참여한 방 + 공개 전환된 완결 방만 (비참여 방은 존재 자체 비노출)
  const relRooms = useMemo(() => rooms.filter(rm => rm.relId === rel?.id
    && ((user && rm.memberIds.includes(user.id)) || (rm.status === 'done' && rm.isPublic))),
    [rooms, rel, user]);

  if (!loaded) return <section className="page" />;
  if (!rel || (rel.visibility === 'private' && !isAdmin) || (rel.visibility === 'member' && !user)) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>RELATIONS</PageTitle><p>자관을 찾을 수 없거나 열람 권한이 없습니다</p></div>
      </section>
    );
  }

  const updateRel = (patch: Partial<Relation>) =>
    setRels(rels.map(r => (r.id === rel.id ? { ...r, ...patch } : r)));
  // AU별 프로필 데이터 갱신 (v1.9) — base는 최상위 필드, 그 외 AU는 aus 항목에
  const patchAuData = (p: { arts?: string[]; timeline?: TlItem[]; questions?: QaEntry[]; qaEnabled?: boolean; qaPool?: string[] }) => {
    if (isBaseAu) updateRel(p);
    else updateRel({ aus: rel.aus.map(a => (a.id === au!.id ? { ...a, ...p } : a)) });
  };

  /* ---------- 멤버 추가 (내 캐릭터 or 새 상대 캐릭터) ---------- */
  const candidates = chars.filter(c => !rel.members.some(m => m.charId === c.id));
  const addMember = () => {
    let cid = mCharId;
    if (mMode === 'new') {
      if (!mName.trim()) { toast('상대 캐릭터 이름을 입력해 주세요'); return; }
      // 상대 캐릭터 간단 등록 (own:false — 내 캐릭터 리스트에는 표시되지 않음, 4.4)
      const nc: Character = {
        id: newId(), name: mName.trim().toUpperCase(), sub: mSub.trim(), color: mColor,
        colors: [{ hex: mColor, label: '테마색' }], specs: [], tabs: [],
        basicHtml: '', visibility: 'public', thumbClass: '', own: false,
        grants: mGrants.length ? mGrants : undefined, // 회원 권한 — 역극 플레이/편집 (v1.9)
      };
      setChars([...chars, nc]);
      cid = nc.id;
    }
    if (!cid) { toast('추가할 캐릭터를 선택해 주세요'); return; }
    const ch = chars.find(c => c.id === cid);
    updateRel({
      members: [...rel.members, {
        charId: cid, quote: mQuote.trim(), keywords: [], desc: '',
        palette: ch?.colors ?? [{ hex: mColor, label: '테마색' }],
        linkedNote: mMode === 'new' ? '상대 캐릭터' : undefined,
      }],
    });
    setMemberOpen(false);
    setMCharId(''); setMQuery(''); setMQuote(''); setMName(''); setMSub('');
    toast('멤버가 추가되었습니다');
  };

  /* ---------- 타임라인 항목 추가 (설명/한마디 중 하나 필수 — 4.5) ---------- */
  const addTlItem = () => {
    const says = tSays.filter(x => x.charId && x.text.trim()).map(({ charId, text }) => ({ charId, text: text.trim() }));
    if (!tDesc.trim() && says.length === 0) { toast('설명 또는 한마디 중 하나는 입력해 주세요'); return; }
    const item: TlItem = {
      era: tEra.trim() || undefined,
      desc: tDesc.trim() || undefined,
      says,
    };
    patchAuData({ timeline: [...auTimeline, item] });
    setTlOpen(false); setTEra(''); setTDesc(''); setTSays([]);
    toast('타임라인 항목이 추가되었습니다');
  };

  /* ---------- 질문 추가 (현재 AU에) ---------- */
  const addQuestion = () => {
    if (!qText.trim()) { toast('질문을 입력해 주세요'); return; }
    const no = Math.max(0, ...auQuestions.map(q => q.no)) + 1;
    const entry: QaEntry = { no, q: qText.trim(), date: new Date().toISOString().slice(0, 10), answers: [] };
    patchAuData({ questions: [entry, ...auQuestions], qaEnabled: true });
    setQOpen(false); setQText(''); setQaNo(no); setTab('qa');
    toast('질문이 등록되었습니다');
  };

  /* ---------- QUESTIONS 질문 리스트 (v1.9 사용자 확정 — 큐 방식) ----------
     리스트를 추가하면 전체가 바로 출제되는 게 아니라 이 자관(AU)의 숨은 대기 풀에 담김.
     이미 출제됐거나 풀에 있는 질문은 검색해서 제외(중복 방지). 출제는 한 번에 하나 —
     현재 질문을 완료하면 풀에서 랜덤으로 다음 질문이 나온다. */
  const addQuestionSet = (set: RelQuestionSet | null) => {
    if (!set) {
      patchAuData({ qaEnabled: true });
      setQsetOpen(false); setTab('qa'); setQaNo(null);
      toast('QUESTIONS 섹션이 추가되었습니다');
      return;
    }
    const seen = new Set([...auQuestions.map(q => q.q), ...auQaPool]);
    const fresh = set.questions.filter(q => !seen.has(q));
    const skipped = set.questions.length - fresh.length;
    let pool = [...auQaPool, ...fresh];
    let questions = auQuestions;
    // 출제 중인 질문이 하나도 없으면 즉시 첫 질문을 랜덤으로 뽑음
    if (questions.length === 0 && pool.length > 0) {
      const i = Math.floor(Math.random() * pool.length);
      const q = pool[i];
      pool = pool.filter((_, j) => j !== i);
      questions = [{ no: 1, q, date: new Date().toISOString().slice(0, 10), answers: [] }];
    }
    patchAuData({ qaPool: pool, questions, qaEnabled: true });
    setQsetOpen(false); setTab('qa'); setQaNo(null);
    toast(fresh.length
      ? `「${set.name}」에서 새 질문 ${fresh.length}개가 대기 리스트에 담겼습니다${skipped ? ` (중복 ${skipped}개 제외)` : ''}`
      : `「${set.name}」의 질문은 전부 이미 담겨 있습니다`);
  };

  /* 현재 질문 완료 → 대기 풀에서 랜덤으로 다음 질문 출제 (v1.9) */
  const drawNextQuestion = () => {
    if (auQaPool.length === 0) { toast('대기 중인 질문이 없습니다 — 질문 리스트를 추가해 주세요'); return; }
    const i = Math.floor(Math.random() * auQaPool.length);
    const q = auQaPool[i];
    const no = Math.max(0, ...auQuestions.map(x => x.no)) + 1;
    patchAuData({
      qaPool: auQaPool.filter((_, j) => j !== i),
      questions: [{ no, q, date: new Date().toISOString().slice(0, 10), answers: [] }, ...auQuestions],
      qaEnabled: true,
    });
    setQaNo(no);
    toast('다음 질문이 출제되었습니다');
  };

  // 이 캐릭터로 답할 수 있는가 — 관리자 전부, 회원은 권한(play/edit) 부여된 캐릭터만 (v1.9)
  const canAnswerAs = (cid: string) => {
    if (isAdmin) return true;
    const c = findChar(chars, cid);
    return !!user && !!c && charGrant(c, user.id) !== null;
  };
  const answerableIds = rel.members.map(m => m.charId).filter(canAnswerAs);

  const submitQa = () => {
    const text = qaText.trim();
    const cid = qaChar ?? answerableIds[0];
    if (!text || !cid || !curQa) return;
    if (!canAnswerAs(cid)) { toast('이 캐릭터로 답할 권한이 없습니다'); return; }
    patchAuData({
      questions: auQuestions.map(q => q.no === curQa.no
        ? { ...q, answers: [...q.answers, { charId: cid, text, authorId: user?.id }] }
        : q),
    });
    setQaText('');
  };

  /* ---------- 답변 수정·삭제·오너 부연 (v1.9 사용자 요청) ----------
     수정: 작성자 본인(구버전 무기록 답변은 관리자) · 삭제: 본인+관리자 · 부연(note): 관리자만 */
  const canEditAns = (a: QaAnswer) => (a.authorId ? a.authorId === user?.id : isAdmin);
  const canDelAns = (a: QaAnswer) => isAdmin || (!!a.authorId && a.authorId === user?.id);
  const saveAnsEdit = () => {
    if (!ansEdit) return;
    patchAuData({
      questions: auQuestions.map(q => q.no === ansEdit.qNo
        ? {
          ...q,
          answers: q.answers.map((a, i) => (i === ansEdit.idx
            ? { ...a, text: ansEdit.text.trim() || a.text, note: ansEdit.note.trim() || undefined }
            : a)),
        }
        : q),
    });
    setAnsEdit(null);
  };
  const deleteAns = (qNo: number, idx: number) =>
    del.ask('이 답변을 삭제하시겠습니까?', () => patchAuData({
      questions: auQuestions.map(q => q.no === qNo
        ? { ...q, answers: q.answers.filter((_, i) => i !== idx) }
        : q),
    }));

  const removeMember = (cid: string) => {
    const name = charOf(cid)?.name ?? '멤버';
    del.ask(`멤버 「${name}」를 제거하시겠습니까?`,
      () => updateRel({ members: rel.members.filter(m => m.charId !== cid) }),
      '자관에서만 빠지며 캐릭터 자체는 삭제되지 않습니다.');
  };

  const pairSlots: (RelMember | null)[] = isDuo
    ? [rel.members[0] ?? null, rel.members[1] ?? null]
    : [];

  return (
    <section className="page page-rel-detail">
      {/* 헤더 이미지 (v1.5) — 풀폭 블러 + 아래로 페이드아웃 (이미지 없으면 데모 그라데이션)
          AU별 완전 분리 (v1.9 사용자 확정): AU는 자기 헤더만 — base 것을 물려받지 않음 */}
      {(() => {
        const hdrId = isBaseAu ? rel.headerImgId : (au?.headerImgId ?? undefined);
        const hdrCrop = isBaseAu ? rel.headerCrop : au?.headerCrop;
        return (
          <div className="rel-backdrop">
            <div className={`img ${hdrId ? 'custom' : ''}`}>
              {hdrId && <CroppedBlobImg fileRef={hdrId} crop={hdrCrop} ph="" />}
            </div>
          </div>
        );
      })()}

      {(rel.aus.length > 1 || isAdmin) && (
        <div className="au-list">
          {rel.aus.map((a, i) => (
            <div key={a.id} className={`au-item ph ${['cool', 'pale', 'red'][i % 3]} ${auId === a.id ? 'on' : ''}`}
              onClick={() => { setAuId(a.id); setArtIdx(0); setQaNo(null); }}>
              <small>{a.label}</small>
            </div>
          ))}
          {isAdmin && (
            <div className="au-item add" data-tip="AU 추가/관리" onClick={() => setAuOpen(true)}>＋</div>
          )}
        </div>
      )}

      {/* 관리자 액션 (좌상단) */}
      {isAdmin && (
        <div className="rel-admin-actions">
          {/* AU 선택 중이면 그 AU의 일러·캐치프레이즈를 편집 (v1.9) */}
          <button className="btn btn-dark" style={{ height: 30, padding: '0 13px', fontSize: 11 }}
            onClick={() => router.push(`/rels/${rel.id}/edit${isBaseAu ? '' : `?au=${au!.id}`}`)}>EDIT</button>
          <button className="btn btn-dark" style={{ height: 30, padding: '0 13px', fontSize: 11 }}
            onClick={() => setDelAsk(true)}>DELETE</button>
        </div>
      )}

      <ConfirmModal open={delAsk} title="자관을 삭제하시겠습니까?"
        body="타임라인·문답·AU 정보가 함께 삭제되며 복구할 수 없습니다. 연동된 캐릭터 자체는 삭제되지 않습니다."
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setRels(rels.filter(r => r.id !== rel.id)); router.push('/rels'); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />

      <div className="rel-hero">
        {isDuo && pairSlots[0] && (
          <div className="quote l" style={{
            color: pairSlots[0].quoteColor,
            ['--q-mark' as string]: pairSlots[0].quoteMarkColor,
          } as React.CSSProperties}>{pairSlots[0].quote}</div>
        )}
        {/* 자관명·캐치프레이즈 글씨색 — 직접 지정 시 (v1.9 사용자 요청, 미지정: 테마) */}
        <h1 style={{ fontFamily: familyOf(rel.fontId), color: rel.nameColor }}>{rel.name}</h1>
        <div className="catch" style={{ color: rel.cpColor }}>
          {au?.catchphrase || rel.catchphrase}
          {auCpTag && <span className="pill" style={{ marginLeft: 10, verticalAlign: 'middle' }}>{CP_LABEL[auCpTag]}</span>}
        </div>
        {isDuo && pairSlots[1] && (
          <div className="quote r" style={{
            color: pairSlots[1].quoteColor,
            ['--q-mark' as string]: pairSlots[1].quoteMarkColor,
          } as React.CSSProperties}>{pairSlots[1].quote}</div>
        )}
      </div>

      {isDuo ? (
        <div className="rel-body" style={{ fontFamily: familyOf(rel.bodyFontId) }}>
          {pairSlots[0]
            ? <MiniProf member={pairSlots[0]} char={charOf(pairSlots[0].charId)} isAdmin={isAdmin}
                auUnregistered={auUnregOf(pairSlots[0].charId)}
                onGo={() => router.push(charHref(pairSlots[0]!.charId))}
                onRemove={() => removeMember(pairSlots[0]!.charId)} />
            : <EmptyCard isAdmin={isAdmin} onAdd={() => setMemberOpen(true)} />}
          <div className={`rel-center ${single ? 'one-mode' : ''}`}
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--line-dark)' }}>
            {/* 전신 — 등록 이미지(AU별 우선) + 크기/앞뒤는 자관 수정의 미리보기에서 (v1.9) */}
            {pairSlots.map((sl, i) => {
              const cid = sl?.charId ?? '';
              const m = rel.members.find(x => x.charId === cid);
              // AU는 자기 전신만 — base 전신을 물려받지 않음 (v1.9 사용자 확정)
              const fullRef = isBaseAu ? m?.fullImgId : au?.fulls?.[cid];
              const front = (rel.fullFront ?? pairSlots[1]?.charId) === cid;
              return (
                <div key={i} className={`fb fb-${i === 0 ? 'l' : 'r'} ${fullRef ? '' : `ph ${charOf(cid)?.thumbClass ?? (i === 0 ? '' : 'warm')}`}`}
                  style={fullRef ? { background: 'transparent', zIndex: front ? 3 : 2 } : undefined}>
                  {fullRef
                    ? <FullImg refId={fullRef} scale={m?.fullScale ?? 90} offX={m?.fullOffX ?? 0} offY={m?.fullOffY ?? 0} />
                    : <span>{charOf(cid)?.name ?? (i === 0 ? 'A' : 'B')} 전신</span>}
                </div>
              );
            })}
            <div className="single" style={{ cursor: auArts.length > 1 ? 'pointer' : undefined }}
              onClick={() => { const n = auArts.length; if (n > 1) setArtIdx(i => (i + 1) % n); }}>
              {auArts.length > 0 ? (
                <>
                  <BlobImg fileRef={auArts[Math.min(artIdx, auArts.length - 1)]} ph="" label="MAIN ILLUST" />
                  {auArts.length > 1 && (
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 44, display: 'flex', justifyContent: 'center', gap: 5, zIndex: 3 }}>
                      {auArts.map((_, i) => (
                        <i key={i} style={{ width: i === Math.min(artIdx, auArts.length - 1) ? 16 : 6, height: 6, borderRadius: 4, background: i === Math.min(artIdx, auArts.length - 1) ? '#fff' : 'rgba(255,255,255,.45)', transition: '.2s' }} />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="ph" style={{ position: 'absolute', inset: 0 }}><span>MAIN ILLUST</span></div>
              )}
            </div>
            {/* 스위치 색 — 자관별 지정(EDIT) 없으면 테마·포인트색 (v1.9) */}
            <div className="illu-toggle seg" style={{
              ['--illu-bg' as string]: rel.illuBg,
              ['--illu-on' as string]: rel.illuOn,
            } as React.CSSProperties}>
              <button className={!single ? 'on' : ''} onClick={() => setOneMode(false)}>전신</button>
              <button className={single ? 'on' : ''} onClick={() => setOneMode(true)}>일러스트</button>
            </div>
          </div>
          {pairSlots[1]
            ? <MiniProf member={pairSlots[1]} char={charOf(pairSlots[1].charId)} isAdmin={isAdmin}
                auUnregistered={auUnregOf(pairSlots[1].charId)}
                onGo={() => router.push(charHref(pairSlots[1]!.charId))}
                onRemove={() => removeMember(pairSlots[1]!.charId)} />
            : <EmptyCard isAdmin={isAdmin} onAdd={() => setMemberOpen(true)} />}
        </div>
      ) : (
        /* 다인 자관 — 프로토타입 multi-body: 좌 멤버 리스트(430px) + 우 그룹 일러 */
        <div className="multi-body" style={{ fontFamily: familyOf(rel.bodyFontId) }}>
          <div className="panel flush" style={{ padding: '6px 0' }}>
            {rel.members.map(m => {
              const c = charOf(m.charId);
              if (!c) return null;
              const unreg = auUnregOf(m.charId);
              return (
                <div key={m.charId} className="mrow" style={{ ['--cc' as string]: rgbTriple(c.color) }}
                  onClick={() => router.push(charHref(m.charId))}>
                  <div className={`face ph ${c.thumbClass}`}>
                    {!unreg && (c.arts?.[0] ?? c.thumbId) && (
                      <CroppedBlobImg fileRef={c.arts?.[0] ?? c.thumbId} crop={c.thumbCrop} ph={c.thumbClass} />
                    )}
                  </div>
                  <div className="nm">
                    {unreg ? (
                      /* AU 프로필 미등록 (v1.9) — 원본 프로필 대신 등록 안내 */
                      <>
                        <b>{findChar(chars, m.charId)?.name}</b>
                        <small>이 AU의 프로필 미등록 — 눌러서 등록</small>
                      </>
                    ) : (
                      <>
                        <b>{c.name}</b><i>{c.sub}</i>
                        <small>{c.specs.slice(0, 3).map(s => s.value).join(' · ')}</small>
                        {(m.quote || m.linkedNote || m.keywords[0]) && (
                          <span className="ext">{m.quote || m.linkedNote || m.keywords[0]}</span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="gem-mini">
                    {(c.colors ?? []).slice(0, 3).map(p => <i key={p.hex + p.label} style={{ background: p.hex }} />)}
                  </div>
                  {isAdmin && (
                    <span className="rm" onClick={e => { e.stopPropagation(); removeMember(m.charId); }}>제거</span>
                  )}
                </div>
              );
            })}
            {isAdmin && rel.members.length < 6 && (
              <div className="mrow add" onClick={() => setMemberOpen(true)}>＋ ADD MEMBER (최대 6인)</div>
            )}
          </div>

          {/* 우: 그룹 일러 — 여러 장이면 클릭 넘김 + 도트 */}
          <div className="multi-illust"
            style={{ cursor: auArts.length > 1 ? 'pointer' : undefined }}
            onClick={() => { const n = auArts.length; if (n > 1) setArtIdx(i => (i + 1) % n); }}>
            {auArts.length > 0 ? (
              <>
                <BlobImg fileRef={auArts[Math.min(artIdx, auArts.length - 1)]} ph="" label="GROUP ILLUST" />
                {auArts.length > 1 && (
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14, display: 'flex', justifyContent: 'center', gap: 5, zIndex: 3 }}>
                    {auArts.map((_, i) => (
                      <i key={i} style={{ width: i === Math.min(artIdx, auArts.length - 1) ? 16 : 6, height: 6, borderRadius: 4, background: i === Math.min(artIdx, auArts.length - 1) ? '#fff' : 'rgba(255,255,255,.45)', transition: '.2s' }} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="ph" style={{ position: 'absolute', inset: 0 }}><span>GROUP ILLUST</span></div>
            )}
          </div>
        </div>
      )}

      {/* 타임라인 / 페어 문답 탭 (v1.8) */}
      <div className={`panel timeline ${!isDuo ? 'multi' : ''}`} style={{ fontFamily: familyOf(rel.bodyFontId) }}>
        <div className="rel-tabs">
          <button className={tab === 'tl' ? 'on' : ''} onClick={() => setTab('tl')}>TIMELINE</button>
          {/* QUESTIONS 섹션은 ＋로 추가해야 생김 (v1.9) — 처음에는 타임라인만 */}
          {qaOn && <button className={tab === 'qa' ? 'on' : ''} onClick={() => setTab('qa')}>QUESTIONS</button>}
          {isAdmin && !qaOn && (
            <button data-tip="QUESTIONS 섹션 추가" style={{ color: 'var(--faint)', fontSize: 14, padding: '0 6px' }}
              onClick={() => setQsetOpen(true)}>＋</button>
          )}
          {isAdmin && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {tab === 'tl' && auTimeline.length > 1 && (
                <button className={`btn ${tlSort ? 'btn-accent' : 'btn-ghost'}`}
                  style={{ height: 29, padding: '0 12px', fontSize: 11 }}
                  onClick={() => setTlSort(v => !v)}>
                  {tlSort ? '정렬 완료' : '⠿ 정렬'}
                </button>
              )}
              {tab === 'tl'
                ? <button className="btn btn-dark" style={{ height: 29, padding: '0 12px', fontSize: 11 }} onClick={() => setTlOpen(true)}>＋ ADD RECORD</button>
                : <>
                  <button className="btn btn-ghost" style={{ height: 29, padding: '0 12px', fontSize: 11 }} onClick={() => setQsetOpen(true)}>＋ 질문 리스트</button>
                  {/* 현재 질문 완료 → 대기 풀에서 랜덤 출제 (v1.9) */}
                  {auQaPool.length > 0 && (
                    <button className="btn btn-ghost" style={{ height: 29, padding: '0 12px', fontSize: 11 }}
                      data-tip={`대기 질문 ${auQaPool.length}개`}
                      onClick={drawNextQuestion}>완료 — 다음 질문</button>
                  )}
                  <button className="btn btn-dark" style={{ height: 29, padding: '0 12px', fontSize: 11 }} onClick={() => setQOpen(true)}>＋ ADD QUESTION</button>
                </>}
            </span>
          )}
        </div>

        {tab === 'tl' ? (
          tlSort ? (
            /* 정렬 모드 — 드래그앤드롭으로 순서 변경 (4.5) */
            <DragList
              items={auTimeline.map((item, i) => ({ item, key: `tl-${i}` }))}
              keyOf={x => x.key}
              onReorder={list => patchAuData({ timeline: list.map(x => x.item) })}
              render={({ item }) => (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '8px 6px', border: '1.5px dashed var(--line)', borderRadius: 9, marginBottom: 6, background: '#fff' }}>
                  <span className="drag-h">⠿</span>
                  <div style={{ minWidth: 0 }}>
                    {item.era && <div className="era">{item.era}</div>}
                    <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.desc || item.says.map(s => s.text).join(' / ')}
                    </div>
                  </div>
                </div>
              )} />
          ) : (
          <div>
            {auTimeline.map((item, i) => (
              <div className="tl-item" key={i}>
                {item.era && <div className="era">{item.era}</div>}
                {item.desc && <div className="desc">{item.desc}</div>}
                {item.says.map((s, j) => {
                  const c = charOf(s.charId);
                  return (
                    <div key={j} className={`tl-say ${sideOf(s.charId)}`}
                      style={{ ['--cc' as string]: rgbTriple(c?.color ?? '#5d636d') }}>
                      <div className="who">{c?.name}</div>
                      <div className="bub">{s.text}</div>
                    </div>
                  );
                })}
                {isAdmin && (
                  <span style={{ fontSize: 10, color: 'var(--faint)', cursor: 'var(--cur-pointer,pointer)' }}
                    onClick={() => del.ask('타임라인 항목을 삭제하시겠습니까?',
                      () => patchAuData({ timeline: auTimeline.filter((_, j) => j !== i) }))}>삭제</span>
                )}
              </div>
            ))}
            {auTimeline.length === 0 && <p className="hint">타임라인이 비어 있습니다 — 우상단 [＋ ADD RECORD]로 추가</p>}
          </div>
          )
        ) : (
          <div className="qa-wrap">
            <div className="qa-today">
              {curQa ? (
                <>
                  <div className="qa-no">TODAY&apos;S QUESTION · Q.{String(curQa.no).padStart(3, '0')}</div>
                  <div className="qa-q">{curQa.q}</div>
                  {/* 날짜만, 오른쪽 정렬 (v1.9 사용자 피드백) */}
                  <div className="qa-date" style={{ textAlign: 'right' }}>{curQa.date.replace(/-/g, '.')}</div>
                  {curQa.answers.map((a, i) => {
                    const c = charOf(a.charId);
                    return (
                      <div key={i} className={`qa-ans ${sideOf(a.charId) === 'r' ? 'r' : ''}`}
                        style={{ ['--cc' as string]: rgbTriple(c?.color ?? '#5d636d') }}>
                        <div className="who">
                          {c?.name}
                          {/* 수정(본인)·부연(관리자)·삭제(본인/관리자) — v1.9 */}
                          {(canEditAns(a) || isAdmin) && (
                            <small style={{ cursor: 'var(--cur-pointer,pointer)', color: 'var(--accent)', marginLeft: 8, fontWeight: 400 }}
                              onClick={() => setAnsEdit({ qNo: curQa.no, idx: i, text: a.text, note: a.note ?? '' })}>
                              {canEditAns(a) ? '수정' : '부연'}
                            </small>
                          )}
                          {canDelAns(a) && (
                            <small style={{ cursor: 'var(--cur-pointer,pointer)', color: 'var(--faint)', marginLeft: 6, fontWeight: 400 }}
                              onClick={() => deleteAns(curQa.no, i)}>삭제</small>
                          )}
                        </div>
                        <div className="bub" {...(a.note ? { 'data-note': a.note } : {})}>{a.text}</div>
                      </div>
                    );
                  })}
                  {answerableIds.length > 0 && (
                    <div className="qa-input">
                      {/* 페어: 클릭 순환 · 다인: 드롭다운으로 선택 (v1.9 사용자 확정) — 권한 있는 캐릭터만 */}
                      <div className="char-pick" onClick={e => {
                        if (isDuo && answerableIds.length > 1) {
                          const cur = qaChar ?? answerableIds[0];
                          setQaChar(answerableIds[(answerableIds.indexOf(cur) + 1) % answerableIds.length]);
                        } else if (answerableIds.length > 1) {
                          if (qaPickPos) { setQaPickPos(null); return; }
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          const h = answerableIds.length * 34 + 10;
                          setQaPickPos({ left: r.left, top: Math.max(8, r.top - h - 6) });
                        }
                      }}>
                        <div className={`f ph ${charOf(qaChar ?? answerableIds[0])?.thumbClass}`} />
                        <small>{charOf(qaChar ?? answerableIds[0])?.name}{answerableIds.length > 1 ? ' ▾' : ''}</small>
                        {qaPickPos && createPortal(
                          <div className="k-sel-pop" style={{ position: 'fixed', left: qaPickPos.left, top: qaPickPos.top, minWidth: 150, zIndex: 120 }}>
                            {answerableIds.map(cid => {
                              const c = charOf(cid);
                              return (
                                <div key={cid} style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                                  onClick={e2 => { e2.stopPropagation(); setQaChar(cid); setQaPickPos(null); }}>
                                  <span className={`ph ${c?.thumbClass}`} style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0 }} />
                                  {c?.name}
                                </div>
                              );
                            })}
                          </div>,
                          document.body,
                        )}
                      </div>
                      <textarea
                        className="k-textarea" style={{ minHeight: 42 }}
                        placeholder="줄바꿈은 Shift+Enter · Enter로 등록"
                        value={qaText}
                        onChange={e => setQaText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQa(); }
                        }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="hint">등록된 문답이 없습니다 — 우상단 [＋ 질문 추가]로 시작해 보세요</p>
              )}
            </div>
            <div className="qa-list">
              <div className="qa-search">
                <span>⌕</span>
                <input placeholder="질문 검색" value={qaQuery} onChange={e => setQaQuery(e.target.value)} />
              </div>
              <div className="qa-scroll">
                {qaFiltered.map(q => (
                  <div key={q.no} className={`qa-item ${curQa?.no === q.no ? 'on' : ''}`} onClick={() => setQaNo(q.no)}>
                    <b>Q.{String(q.no).padStart(3, '0')} {q.q}</b>
                    <small>{q.date.slice(5).replace('-', '.')} · 답변 {q.answers.length}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 역극 · 로그 연동 리스트 (4.5) — 역극: 내 참여 방 + 공개 전환된 완결 방 */}
      <div className="g2" style={{ marginTop: 16 }}>
        <div className="panel widget" style={{ margin: 0 }}>
          <h4>역극 <span className="more" onClick={() => router.push('/rp')}>더보기 ›</span></h4>
          {relRooms.length > 0 ? relRooms.map(rm => (
            <div key={rm.id} className="dday-row" style={{ cursor: 'var(--cur-pointer,pointer)' }} onClick={() => router.push('/rp')}>
              <span>{rm.title}</span>
              <b style={{ fontSize: 11, color: 'var(--faint)' }}>
                {rm.status === 'done' ? (rm.isPublic ? '완결 · 공개' : '완결') : '진행중'}
              </b>
            </div>
          )) : (
            <p className="hint" style={{ margin: 0 }}>이 자관 기반으로 진행된 역극이 여기에 표시됩니다</p>
          )}
        </div>
        <div className="panel widget" style={{ margin: 0 }}>
          <h4>로그 <span className="more" onClick={() => router.push('/trpg')}>더보기 ›</span></h4>
          {relLogs.length > 0 ? relLogs.map(l => (
            <div key={l.id} className="dday-row" style={{ cursor: 'var(--cur-pointer,pointer)' }} onClick={() => router.push(`/trpg/${l.id}`)}>
              <span>№{l.no} {l.title}</span>
              <b style={{ fontSize: 11, color: 'var(--faint)' }}>{l.date?.replace(/-/g, '.') ?? ''}</b>
            </div>
          )) : <p className="hint" style={{ margin: 0 }}>연동된 로그가 없습니다 — 로그 등록 시 자관을 선택하면 여기에 표시</p>}
        </div>
      </div>

      {/* ---------- 멤버 추가 모달 ---------- */}
      <Modal open={memberOpen} onClose={() => setMemberOpen(false)} small title="멤버 추가"
        dirty={!!(mCharId || mName || mQuote)}
        desc="내 캐릭터를 연동하거나, 상대(타인) 캐릭터를 간단 등록 — 상대 캐릭터는 내 캐릭터 리스트에 표시되지 않음"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setMemberOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={addMember}>ADD</button>
        </>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <KRadio name="mm" value="exist" current={mMode} onChange={v => setMMode(v as 'exist')} label="기존 캐릭터" />
            <KRadio name="mm" value="new" current={mMode} onChange={v => setMMode(v as 'new')} label="새 상대 캐릭터" />
          </div>
          {mMode === 'exist' ? (
            <div>
              {/* 검색형 선택 — 인풋으로 거르고 아래 리스트에서 클릭 */}
              <KInput placeholder="캐릭터 검색" value={mQuery} onChange={e => setMQuery(e.target.value)} />
              <div style={{ marginTop: 6, maxHeight: 190, overflowY: 'auto', border: '1.5px solid var(--line)', borderRadius: 9 }}>
                {candidates
                  .filter(c => {
                    const s = mQuery.trim().toLowerCase();
                    return !s || c.name.toLowerCase().includes(s) || (c.sub ?? '').toLowerCase().includes(s);
                  })
                  .map(c => (
                    <div key={c.id} onClick={() => setMCharId(mCharId === c.id ? '' : c.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', cursor: 'var(--cur-pointer,pointer)',
                        background: mCharId === c.id ? 'rgba(127,127,127,.12)' : undefined,
                        borderBottom: '1px dashed var(--line)', transition: '.13s',
                      }}>
                      <i style={{ width: 9, height: 9, borderRadius: '50%', background: c.color, fontStyle: 'normal', flexShrink: 0 }} />
                      <b style={{ fontSize: 12.5 }}>{c.name}</b>
                      <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{c.sub}{!c.own && ' · 상대'}</small>
                      {mCharId === c.id && <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
                    </div>
                  ))}
                {candidates.length === 0 && <p className="hint" style={{ padding: 10 }}>추가할 수 있는 캐릭터가 없습니다</p>}
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <KInput placeholder="이름" value={mName} onChange={e => setMName(e.target.value)} />
                <KInput placeholder="한 줄 소개 (선택)" value={mSub} onChange={e => setMSub(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                <span className="cp-lb">테마색</span>
                <ColorField value={mColor} onChange={setMColor} />
              </div>
              {/* 회원 권한 — 역극 플레이 / 편집까지 (3차 회원-캐릭터 연결, v1.9) */}
              <div>
                <label className="k-label" style={{ marginBottom: 7 }}>회원 권한 (선택)</label>
                <GrantsEditor value={mGrants} onChange={setMGrants} />
              </div>
            </>
          )}
          <KInput placeholder="캐릭터 한마디 (선택 — 타이틀 옆 인용구)" value={mQuote} onChange={e => setMQuote(e.target.value)} />
        </div>
      </Modal>

      {/* ---------- 타임라인 항목 추가 모달 (가운데 · 한마디 핑퐁 다중) ---------- */}
      <Modal open={tlOpen} onClose={() => setTlOpen(false)} title="타임라인 항목 추가"
        desc="설명 / 한마디 중 하나는 필수 · 시기 라벨은 선택 · 한마디는 여러 개 추가 가능"
        dirty={!!(tEra || tDesc || tSays.some(x => x.text))}
        actions={<>
          <button className="btn btn-ghost" onClick={() => setTlOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={addTlItem}>ADD</button>
        </>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <KInput placeholder="시기 라벨 (선택)" value={tEra} onChange={e => setTEra(e.target.value)} />
          <KTextarea placeholder="설명" value={tDesc} onChange={e => setTDesc(e.target.value)} style={{ minHeight: 80 }} />
          <label className="k-label" style={{ margin: 0 }}>한마디 — 캐릭터를 바꿔가며 주고받는 대화로 쌓을 수 있습니다</label>
          {tSays.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <KSelect minWidth={130} value={s.charId} placeholder="발화 캐릭터"
                onChange={v => setTSays(l => l.map(x => x.id === s.id ? { ...x, charId: v } : x))}
                options={rel.members.map(m => {
                  const c = charOf(m.charId);
                  return { value: m.charId, label: c?.name ?? m.charId };
                })} />
              <KInput placeholder="대사" value={s.text}
                onChange={e => setTSays(l => l.map(x => x.id === s.id ? { ...x, text: e.target.value } : x))} />
              <span className="fx" onClick={() => setTSays(l => l.filter(x => x.id !== s.id))}>✕</span>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, justifySelf: 'center' }}
            onClick={() => {
              // 새 줄의 기본 화자는 직전 화자와 번갈아 (핑퐁)
              const last = tSays[tSays.length - 1]?.charId;
              const ids = rel.members.map(m => m.charId);
              const next = last ? ids[(ids.indexOf(last) + 1) % ids.length] : ids[0] ?? '';
              setTSays(l => [...l, { id: newId(), charId: next, text: '' }]);
            }}>＋ ADD LINE</button>
        </div>
      </Modal>

      {/* ---------- 질문 추가 모달 ---------- */}
      {/* ---------- AU 추가/관리 모달 (v1.8 — AU별 이미지·카드 분리는 후속) ---------- */}
      <Modal open={auOpen} onClose={() => setAuOpen(false)} small title="AU 관리"
        dirty={!!(auLabel || auCatch)}
        desc="AU를 클릭하면 프로필 전체(일러·타임라인·문답·CP/NCP)가 그 AU의 것으로 전환됩니다 — 일러·캐치프레이즈는 그 AU를 선택한 상태에서 EDIT"
        actions={<button className="btn btn-dark" onClick={() => setAuOpen(false)}>닫기</button>}>
        <div style={{ display: 'grid', gap: 8 }}>
          {rel.aus.map(a => (
            <div key={a.id} style={{ display: 'grid', gap: 7, padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ fontSize: 12.5, flexShrink: 0 }}>{a.label}</b>
                <small style={{ color: 'var(--faint)', fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.catchphrase}</small>
                {/* AU별 CP/NCP — 이름 줄 오른쪽 정렬 (v1.9 사용자 요청) */}
                <div className="mini-seg" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                  {(['cp', 'ncp'] as RelCpTag[]).map(t => (
                    <button key={t} className={(a.cp ?? rel.cp) === t ? 'on' : ''}
                      onClick={() => updateRel({ aus: rel.aus.map(x => (x.id === a.id ? { ...x, cp: t } : x)) })}>{CP_LABEL[t]}</button>
                  ))}
                </div>
                {a.id !== 'base' && (
                  <span className="fx" style={{ flexShrink: 0 }}
                    onClick={() => del.ask(`AU 「${a.label}」를 삭제하시겠습니까?`, () => {
                      updateRel({ aus: rel.aus.filter(x => x.id !== a.id) });
                      if (auId === a.id) setAuId('base');
                    }, '이 AU의 일러·타임라인·문답이 함께 삭제되며 복구할 수 없습니다.')}>✕</span>
                )}
              </div>
            </div>
          ))}
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <KInput placeholder="AU 이름" value={auLabel} onChange={e => setAuLabel(e.target.value)} style={{ maxWidth: 130 }} />
              <KInput placeholder="캐치프레이즈" value={auCatch} onChange={e => setAuCatch(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="mini-seg">
                {(['cp', 'ncp'] as RelCpTag[]).map(t => (
                  <button key={t} className={auCp === t ? 'on' : ''} onClick={() => setAuCp(t)}>{CP_LABEL[t]}</button>
                ))}
              </div>
              <button className="btn btn-dark" style={{ whiteSpace: 'nowrap', marginLeft: 'auto' }} onClick={() => {
                if (!auLabel.trim()) { toast('AU 이름을 입력해 주세요'); return; }
                const na: RelAu = { id: newId(), label: auLabel.trim(), catchphrase: auCatch.trim(), cp: auCp, timeline: [], questions: [] };
                updateRel({ aus: [...rel.aus, na] });
                setAuLabel(''); setAuCatch('');
              }}>＋ ADD AU</button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ---------- QUESTIONS 섹션 추가 — 질문 리스트 선택 (v1.9) ---------- */}
      <Modal open={qsetOpen} onClose={() => setQsetOpen(false)} small title="질문 리스트 추가"
        desc="환경설정 > 자관 질문의 세트에서 골라 현재 AU의 QUESTIONS에 넣습니다"
        actions={<button className="btn btn-ghost" onClick={() => setQsetOpen(false)}>CANCEL</button>}>
        <div style={{ display: 'grid', gap: 8 }}>
          {[...qsets].sort((a, b) => (a.cat === (auCpTag ?? 'cp') ? -1 : 0) - (b.cat === (auCpTag ?? 'cp') ? -1 : 0)).map(s => (
            <button key={s.id} type="button" onClick={() => addQuestionSet(s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', textAlign: 'left',
                border: '1.5px solid var(--line)', borderRadius: 9, transition: '.13s', width: '100%',
              }}>
              <span className="pill dark">{CP_LABEL[s.cat]}</span>
              <b style={{ fontSize: 12.5 }}>{s.name}</b>
              <small style={{ marginLeft: 'auto', color: 'var(--faint)', fontSize: 10.5 }}>질문 {s.questions.length}개</small>
            </button>
          ))}
          {qsets.length === 0 && <p className="hint" style={{ margin: 0 }}>환경설정 &gt; 자관 질문에서 세트를 먼저 만들어 주세요</p>}
          {/* QUESTIONS 섹션이 아직 없을 때만 — 이미 있으면 리스트 추가 용도뿐 (v1.9 사용자 지적) */}
          {!qaOn && (
            /* 세트 버튼과 같은 세로폭 (v1.9 사용자 피드백) */
            <button type="button" className="btn btn-ghost"
              style={{ padding: '10px 13px', fontSize: 12, justifyContent: 'center', width: '100%' }}
              onClick={() => addQuestionSet(null)}>빈 섹션으로 시작</button>
          )}
        </div>
      </Modal>

      <Modal open={qOpen} onClose={() => setQOpen(false)} small title="질문 추가"
        dirty={!!qText}
        desc="이 자관의 문답 질문을 등록 — 문항 풀·랜덤 출제 관리는 환경설정에서 (후속)"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setQOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={addQuestion}>ADD</button>
        </>}>
        <KTextarea placeholder="질문" value={qText}
          onChange={e => setQText(e.target.value)} style={{ minHeight: 60 }} />
      </Modal>
      {/* 답변 수정·오너 부연 (v1.9) — 텍스트는 작성자 본인, 부연설명은 관리자 */}
      <Modal open={ansEdit !== null} onClose={() => setAnsEdit(null)} small
        title={ansEdit && canEditAns(curQa?.answers[ansEdit.idx] ?? { charId: '', text: '' }) ? '답변 수정' : '오너 부연설명'}
        dirty={!!ansEdit}
        actions={<>
          <button className="btn btn-ghost" onClick={() => setAnsEdit(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={saveAnsEdit}>SAVE</button>
        </>}>
        {ansEdit && (
          <div style={{ display: 'grid', gap: 9 }}>
            {canEditAns(curQa?.answers[ansEdit.idx] ?? { charId: '', text: '' }) && (
              <KTextarea value={ansEdit.text} onChange={e => setAnsEdit(s => s && { ...s, text: e.target.value })}
                style={{ minHeight: 60 }} />
            )}
            {isAdmin && (
              <div>
                <label className="k-label" style={{ marginBottom: 5 }}>오너 부연설명 — 말풍선에 마우스를 올리면 표시 (비우면 없음)</label>
                <KTextarea value={ansEdit.note} onChange={e => setAnsEdit(s => s && { ...s, note: e.target.value })}
                  style={{ minHeight: 46 }} />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 삭제 확인 — DOM 마지막에 렌더해 다른 모달(AU 관리 등) 위에 뜨게 */}
      {del.element}
    </section>
  );
}
