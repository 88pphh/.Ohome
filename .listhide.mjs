import fs from 'node:fs';
const load = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const save = (p, s) => fs.writeFileSync(p, s.replace(/\n/g, '\r\n'));
const rep = (s, a, b, tag) => {
  if (!s.includes(a)) { console.error('MISS [' + tag + ']:', a.slice(0, 70)); process.exit(1); }
  return s.replace(a, b);
};

/* ---- 1. TrpgLog 타입 — 접근권한과 별개인 목록 표시 여부 (v2.0 사용자 요청) ---- */
{
  const p = 'src/lib/galleryStore.ts';
  let s = load(p);
  s = rep(s,
    `  visibility: Visibility;
  password?: string;         // 열람 비밀번호 (선택) — 권한이 없어도 비밀번호로 열람 가능
}`,
    `  visibility: Visibility;
  password?: string;         // 열람 비밀번호 (선택) — 권한이 없어도 비밀번호로 열람 가능
  // 목록 표시 여부 (v2.0 사용자 요청) — 접근권한(누가 열 수 있는지)과는 별개로, 목록에 줄이 뜰지만 정하는
  // 스위치. 나만보기(private)여도 이걸 켜지 않으면 관리자 목록에서 사라지지 않는다 — 반대로 이걸 켜면
  // 전체공개여도 목록에서만 빠지고 직접 링크로는 그대로 열린다. 관리자는 편집모드에서 숨김 표시로 계속 본다
  listHidden?: boolean;
}`, 'TrpgLog listHidden field');
  save(p, s);
  console.log('galleryStore ok');
}

/* ---- 2. 로그 목록 페이지 — ADD LOG 모달 + 필터 ---- */
{
  const p = 'src/app/trpg/page.tsx';
  let s = load(p);

  s = rep(s,
    `  const [nVis, setNVis] = useState<'public' | 'member' | 'private'>('public'); // 접근권한`,
    `  const [nVis, setNVis] = useState<'public' | 'member' | 'private'>('public'); // 접근권한
  const [nListHidden, setNListHidden] = useState(false);   // 목록 표시 여부 (v2.0 — 접근권한과 별개)`, 'nListHidden state');

  s = rep(s,
    `      thumbColor: nThumb ? undefined : { c1: nC1, c2: nColorMode === 'grad' ? nC2 : undefined },
    };
    log.visibility = nVis;
    log.password = nPw.trim() || undefined;
    setLogs([log, ...logs]);
    setAddOpen(false);
    setNNo(''); setNVis('public'); setNPw(''); setNTitle(''); setNCatch(''); setNWriter(''); setNWith(''); setNBody(''); setNFileName(''); setNDate(''); setNFile(null);`,
    `      thumbColor: nThumb ? undefined : { c1: nC1, c2: nColorMode === 'grad' ? nC2 : undefined },
    };
    log.visibility = nVis;
    log.password = nPw.trim() || undefined;
    log.listHidden = nListHidden;
    setLogs([log, ...logs]);
    setAddOpen(false);
    setNNo(''); setNVis('public'); setNPw(''); setNListHidden(false); setNTitle(''); setNCatch(''); setNWriter(''); setNWith(''); setNBody(''); setNFileName(''); setNDate(''); setNFile(null);`, 'add() payload');

  // visible 필터 — 편집모드가 아니면 숨김 로그를 제외 (관리자 포함 전원)
  s = rep(s,
    `  const visible = logs
    .filter(l => isAdmin || l.visibility === 'public' || (l.visibility === 'member' && user) || !!l.password)`,
    `  const visible = logs
    // 목록 숨김 — 관리자도 편집모드가 아니면 안 보인다(목록을 정리해 두는 용도라, v2.0 사용자 요청).
    // 편집모드에서는 관리자에게만 예외로 보여 되돌릴 수 있게 한다
    .filter(l => !l.listHidden || (isAdmin && editOn))
    .filter(l => isAdmin || l.visibility === 'public' || (l.visibility === 'member' && user) || !!l.password)`, 'visible filter');

  // ADD LOG 모달 UI — 접근권한 행 바로 아래 새 행
  s = rep(s,
    `            <KInput placeholder="열람 비밀번호 (선택)" value={nPw} onChange={e => setNPw(e.target.value)} style={{ flex: 1 }} />
          </div>

          {/* 썸네일 (선택) — 이미지 업로드 또는 단색/그라데이션 */}`,
    `            <KInput placeholder="열람 비밀번호 (선택)" value={nPw} onChange={e => setNPw(e.target.value)} style={{ flex: 1 }} />
          </div>
          {/* 목록 표시 — 접근권한과 별개 (v2.0 사용자 요청). 숨겨도 직접 링크·비밀번호로는 그대로 열림 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="cp-lb">목록</span>
            <KSelect minWidth={140} value={nListHidden ? 'hidden' : 'show'}
              onChange={v => setNListHidden(v === 'hidden')}
              options={[
                { value: 'show', label: '목록에 표시' },
                { value: 'hidden', label: '목록에서 숨기기' },
              ]} />
          </div>

          {/* 썸네일 (선택) — 이미지 업로드 또는 단색/그라데이션 */}`, 'add modal listHidden row');

  save(p, s);
  console.log('trpg/page ok');
}

/* ---- 3. 로그 상세 — EDIT 모달 ---- */
{
  const p = 'src/app/trpg/[id]/page.tsx';
  let s = load(p);

  s = rep(s,
    `  const [e, setE] = useState({
    noText: '', title: '', catchphrase: '', writer: '', withText: '',
    relId: 'none', date: '', visibility: 'public' as TrpgLog['visibility'], password: '',
  });`,
    `  const [e, setE] = useState({
    noText: '', title: '', catchphrase: '', writer: '', withText: '',
    relId: 'none', date: '', visibility: 'public' as TrpgLog['visibility'], password: '',
    listHidden: false,   // 목록 표시 여부 (v2.0 — 접근권한과 별개)
  });`, 'edit state field');

  s = rep(s,
    `              noText: l.noText ?? '', title: l.title, catchphrase: l.catchphrase ?? '', writer: l.writer,
              withText: l.withText, relId: l.relId ?? 'none', date: l.date ?? '',
              visibility: l.visibility, password: l.password ?? '',
            });`,
    `              noText: l.noText ?? '', title: l.title, catchphrase: l.catchphrase ?? '', writer: l.writer,
              withText: l.withText, relId: l.relId ?? 'none', date: l.date ?? '',
              visibility: l.visibility, password: l.password ?? '', listHidden: !!l.listHidden,
            });`, 'edit open prefill');

  s = rep(s,
    `      visibility: e.visibility, password: e.password.trim() || undefined,
      bodyHtml: bodyDisp === 'auto' ? undefined : bodyDisp === 'html',`,
    `      visibility: e.visibility, password: e.password.trim() || undefined,
      listHidden: e.listHidden,
      bodyHtml: bodyDisp === 'auto' ? undefined : bodyDisp === 'html',`, 'saveEdit payload');

  s = rep(s,
    `            <KInput placeholder="열람 비밀번호 (선택)" value={e.password} onChange={ev => setE(s => ({ ...s, password: ev.target.value }))} style={{ flex: 1 }} />
          </div>

          {/* 썸네일 교체 — 기본은 현재 썸네일 유지 */}`,
    `            <KInput placeholder="열람 비밀번호 (선택)" value={e.password} onChange={ev => setE(s => ({ ...s, password: ev.target.value }))} style={{ flex: 1 }} />
          </div>
          {/* 목록 표시 — 접근권한과 별개 (v2.0 사용자 요청) */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="cp-lb">목록</span>
            <KSelect minWidth={140} value={e.listHidden ? 'hidden' : 'show'}
              onChange={v => setE(s => ({ ...s, listHidden: v === 'hidden' }))}
              options={[
                { value: 'show', label: '목록에 표시' },
                { value: 'hidden', label: '목록에서 숨기기' },
              ]} />
          </div>

          {/* 썸네일 교체 — 기본은 현재 썸네일 유지 */}`, 'edit modal listHidden row');

  save(p, s);
  console.log('trpg/[id] ok');
}
