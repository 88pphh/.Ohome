'use client';
// 커미션 등록/수정 공용 폼 (4.18) — 이름/서브/상태/가격/마감 기준/슬롯/문의 링크/
// 이미지 다중(첫 장 = 대표·썸네일)/설명(HTML+MD)/폰트 개별/페이지 테마컬러
import React, { useState } from 'react';
import { CommItem, CommSettings, SlotMode, SlotShape, SLOT_CHARS, badgeStyle, CommFormField, CommFormFieldType } from '@/lib/commStore';
import { newId } from '@/lib/postStore';
import { useFonts } from '@/lib/fontStore';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { KInput, KSelect, KStep, KCheck } from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { CropEditor, CropValue, CropImg } from '@/components/ui/CropEditor';
import { DragList } from '@/components/ui/DragList';
import { RichEditor } from '@/components/ui/RichEditor';
import { useConfirmDelete } from '@/components/ui/Modal';
import { fileDrop } from '@/lib/dnd';
import { useToast } from '@/components/ui/Toast';

export interface CommFormValue {
  name: string; sub: string; badgeId: string;
  priceMin: number; priceMax: number; deadlineNote: string;
  slotMode: SlotMode; slotTotal: number; slotUsed: number; slotShape: SlotShape; slotColor: string;
  contactUrl?: string;
  images: string[]; thumbCrop?: CropValue;
  descHtml: string; titleFontId: string; bodyFontId: string;
  themeMode: 'site' | 'custom'; themeColor?: string; themeTone?: 'dark' | 'light';
  form: CommFormField[];       // 커미션 양식 (v1.9)
  formEnabled: boolean;
}

const FIELD_TYPE_LABEL: Record<CommFormFieldType, string> = {
  text: '텍스트', single: '단일 선택', multi: '다중 선택', image: '이미지 첨부',
};

interface ArtItem { id: string; ref?: string; url?: string; file?: File }

function ArtThumb({ item, crop, ratio }: { item: ArtItem; crop?: CropValue; ratio: string }) {
  const loaded = useBlobUrl(item.ref);
  const src = item.url ?? loaded;
  return (
    <div style={{ width: 74, aspectRatio: ratio.replace(':', '/'), borderRadius: 7, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
      {src ? <CropImg src={src} crop={crop} /> : <div className="ph" style={{ position: 'absolute', inset: 0 }} />}
    </div>
  );
}

function FirstCrop({ item, aspect, crop, onClose, onApply }: {
  item: ArtItem; aspect: '3:4' | '4:3'; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const loaded = useBlobUrl(item.ref);
  const src = item.url ?? loaded;
  if (!src) return null;
  return <CropEditor open src={src} aspect={aspect} initial={crop} onClose={onClose} onApply={onApply} />;
}

export function CommForm({ initial, settings, onSave, onCancel }: {
  initial: CommItem | null;
  settings: CommSettings;
  onSave: (v: CommFormValue) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const del = useConfirmDelete();   // 삭제 확인 모달 (v1.9 — 이미지·양식 항목)
  const { fonts, familyOf } = useFonts();
  const isNew = !initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [sub, setSub] = useState(initial?.sub ?? '');
  const [badgeId, setBadgeId] = useState(initial?.badgeId ?? settings.commBadges[0]?.id ?? 'open');
  const [priceMin, setPriceMin] = useState(String(initial?.priceMin ?? ''));
  const [priceMax, setPriceMax] = useState(String(initial?.priceMax ?? ''));
  const [deadlineNote, setDeadlineNote] = useState(initial?.deadlineNote ?? '');
  const [slotMode, setSlotMode] = useState<SlotMode>(initial?.slotMode ?? 'included');
  const [slotTotal, setSlotTotal] = useState(initial?.slotTotal ?? 3);
  const [slotUsed, setSlotUsed] = useState(initial?.slotUsed ?? 0);
  const [slotShape, setSlotShape] = useState<SlotShape>(initial?.slotShape ?? 'diamond');
  const [slotColor, setSlotColor] = useState(initial?.slotColor ?? '#a63a45');
  const [contactUrl, setContactUrl] = useState(initial?.contactUrl ?? '');
  const [arts, setArts] = useState<ArtItem[]>(() => (initial?.images ?? []).map(r => ({ id: newId(), ref: r })));
  const [thumbCrop, setThumbCrop] = useState<CropValue | undefined>(initial?.thumbCrop);
  const [cropOpen, setCropOpen] = useState(false);
  const [descHtml, setDescHtml] = useState(initial?.descHtml ?? '');
  const [titleFontId, setTitleFontId] = useState(initial?.titleFontId ?? 'serif');
  const [bodyFontId, setBodyFontId] = useState(initial?.bodyFontId ?? 'default');
  const [themeMode, setThemeMode] = useState<'site' | 'custom'>(initial?.themeMode ?? 'site');
  const [themeColor, setThemeColor] = useState(initial?.themeColor ?? '#4c6a8e');
  const [themeTone, setThemeTone] = useState<'dark' | 'light'>(initial?.themeTone ?? 'dark');
  // 커미션 양식 (v1.9) — 텍스트/단일 선택/다중 선택/이미지 항목 빌더 + 사용함/사용안함
  const [form, setForm] = useState<CommFormField[]>(initial?.form ?? []);
  const [formEnabled, setFormEnabled] = useState(initial?.formEnabled ?? false);
  const patchField = (id: string, p: Partial<CommFormField>) =>
    setForm(fs => fs.map(f => (f.id === id ? { ...f, ...p } : f)));

  const addArts = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const items = Array.from(list).map(f => ({ id: newId(), url: URL.createObjectURL(f), file: f }));
    setArts(prev => {
      if (prev.length === 0) { setThumbCrop(undefined); setCropOpen(true); }
      return [...prev, ...items];
    });
  };

  const save = async () => {
    if (!name.trim()) { toast('커미션 이름을 입력해 주세요'); return; }
    const min = parseInt(priceMin.replace(/[^\d]/g, ''), 10) || 0;
    const max = parseInt(priceMax.replace(/[^\d]/g, ''), 10) || min;
    const images = await Promise.all(arts.map(a => (a.file ? putBlob(a.file) : Promise.resolve(a.ref!))));
    onSave({
      name: name.trim(), sub: sub.trim(), badgeId,
      priceMin: min, priceMax: max, deadlineNote: deadlineNote.trim(),
      slotMode, slotTotal, slotUsed, slotShape, slotColor,
      contactUrl: contactUrl.trim() || undefined,
      images, thumbCrop, descHtml,
      form,   // 질문이 비어도 유지 — 필터로 항목이 사라지던 버그 수정 (v1.9 사용자 지적)
      formEnabled,
      titleFontId, bodyFontId,
      themeMode, themeColor: themeMode === 'custom' ? themeColor : undefined,
      themeTone: themeMode === 'custom' ? themeTone : undefined,
    });
  };

  return (
    <div className="write-grid">
      {/* 좌: 이미지 + 설명 */}
      <div className="panel" style={{ padding: 24, display: 'grid', gap: 13, alignContent: 'start' }}>
        <label className="k-label" style={{ margin: 0 }}>
          대표 이미지 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 첫 장이 리스트 썸네일({settings.ratio} 크롭) · 상세 뷰어에서 넘겨보기 · ⠿ 순서</span>
        </label>
        {arts.length > 0 && (
          <DragList items={arts} keyOf={a => a.id} onReorder={setArts}
            render={(a, i) => (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '3px 0' }}>
                <span className="drag-h">⠿</span>
                <ArtThumb item={a} crop={i === 0 ? thumbCrop : undefined} ratio={settings.ratio} />
                {i === 0 ? (
                  <>
                    <span className="pill dark">대표 · 썸네일</span>
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                      onClick={() => setCropOpen(true)}>✂ 썸네일 위치</button>
                  </>
                ) : <span className="pill">추가 이미지</span>}
                <span className="fx" style={{ marginLeft: 'auto' }}
                  onClick={() => del.ask('이 이미지를 삭제하시겠습니까?', () => setArts(l => l.filter(x => x.id !== a.id)))}>✕</span>
              </div>
            )} />
        )}
        <input id="cmArtsF" type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { addArts(e.target.files); e.target.value = ''; }} />
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, justifySelf: 'center' }}
          onClick={() => document.getElementById('cmArtsF')?.click()}
          {...fileDrop(fl => addArts(fl))}>＋ ADD IMAGE</button>

        <label className="k-label" style={{ margin: '4px 0 0' }}>
          커미션 설명 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 문단 사이 어디든 이미지 삽입 가능 · 스크립트 불허</span>
        </label>
        <RichEditor value={descHtml} onChange={setDescHtml} placeholder="커미션 안내를 작성하세요" />

        {/* 커미션 양식 (v1.9) — 신청 시 받을 항목: 텍스트 / 단일 선택 / 다중 선택 / 이미지 첨부 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 0', flexWrap: 'wrap' }}>
          <label className="k-label" style={{ margin: 0 }}>
            커미션 양식 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 신청 시 받을 항목 · ⠿ 순서</span>
          </label>
          <div className="mini-seg">
            <button className={formEnabled ? 'on' : ''} onClick={() => setFormEnabled(true)}>사용함</button>
            <button className={!formEnabled ? 'on' : ''} onClick={() => setFormEnabled(false)}>사용 안 함</button>
          </div>
        </div>
        {formEnabled && form.length > 0 && (
          <DragList items={form} keyOf={f => f.id} onReorder={setForm}
            render={f => (
              <div className="cmf-field" style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="drag-h">⠿</span>
                  <KSelect minWidth={104} value={f.type}
                    onChange={v => patchField(f.id, {
                      type: v as CommFormFieldType,
                      options: v === 'single' || v === 'multi' ? (f.options?.length ? f.options : ['']) : undefined,
                    })}
                    options={(Object.keys(FIELD_TYPE_LABEL) as CommFormFieldType[])
                      .map(t => ({ value: t, label: FIELD_TYPE_LABEL[t] }))} />
                  <KInput placeholder="질문" value={f.label}
                    onChange={e => patchField(f.id, { label: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                  <span className="fx" onClick={() => {
                    const remove = () => setForm(fs => fs.filter(x => x.id !== f.id));
                    if (f.label.trim() || f.options?.some(o => o.trim())) {
                      del.ask('이 양식 항목을 삭제하시겠습니까?', remove, f.label.trim() ? `"${f.label}"` : undefined);
                    } else remove();
                  }}>✕</span>
                </div>
                <KInput placeholder="보조 설명 (선택)" value={f.desc ?? ''}
                  onChange={e => patchField(f.id, { desc: e.target.value || undefined })}
                  style={{ marginTop: 7, fontSize: 12 }} />
                {(f.type === 'single' || f.type === 'multi') && (
                  <div style={{ display: 'grid', gap: 6, marginTop: 8, paddingLeft: 22 }}>
                    {(f.options ?? []).map((op, oi) => (
                      <div key={oi} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ color: 'var(--faint)', fontSize: 12, flexShrink: 0 }}>
                          {f.type === 'single' ? '○' : '□'}
                        </span>
                        <KInput placeholder="선택지" value={op}
                          onChange={e => patchField(f.id, {
                            options: f.options!.map((x, i) => (i === oi ? e.target.value : x)),
                          })} style={{ flex: 1, minWidth: 0, fontSize: 12 }} />
                        <span className="fx" style={{ fontSize: 10, padding: '2px 4px' }}
                          onClick={() => {
                            const remove = () => patchField(f.id, { options: f.options!.filter((_, i) => i !== oi) });
                            if (op.trim()) del.ask('이 선택지를 삭제하시겠습니까?', remove, `"${op}"`);
                            else remove();
                          }}>✕</span>
                      </div>
                    ))}
                    <button className="btn btn-ghost"
                      style={{ padding: '5px 12px', fontSize: 10.5, justifySelf: 'center', display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}
                      onClick={() => patchField(f.id, { options: [...(f.options ?? []), ''] })}>＋ 선택지</button>
                  </div>
                )}
                {/* 필수 답변 줄 — 이미지 첨부면 한 장/여러 장을 오른쪽 끝에 (v1.9) */}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <KCheck label={<span style={{ fontSize: 11.5 }}>필수 답변</span>}
                    checked={!!f.required} onChange={v => patchField(f.id, { required: v || undefined })} />
                  {f.type === 'image' && (
                    <div className="mini-seg" style={{ marginLeft: 'auto' }}>
                      <button className={!f.multiple ? 'on' : ''} onClick={() => patchField(f.id, { multiple: undefined })}>한 장만</button>
                      <button className={f.multiple ? 'on' : ''} onClick={() => patchField(f.id, { multiple: true })}>여러 장</button>
                    </div>
                  )}
                </div>
              </div>
            )} />
        )}
        {formEnabled && (
          <button className="btn btn-ghost"
            style={{ padding: '6px 13px', fontSize: 11, justifySelf: 'center', display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}
            onClick={() => setForm(fs => [...fs, { id: newId(), type: 'text', label: '' }])}>＋ ADD FIELD</button>
        )}
      </div>

      {/* 우: 정보 + 저장 */}
      <div>
        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>기본</h4>
          <div style={{ display: 'grid', gap: 9 }}>
            <KInput placeholder="커미션 이름" value={name} onChange={e => setName(e.target.value)}
              style={{ fontFamily: familyOf(titleFontId) }} />
            <KInput placeholder="영문 서브" value={sub} onChange={e => setSub(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <KSelect minWidth={120} value={badgeId} onChange={setBadgeId}
                options={settings.commBadges.map(b => ({ value: b.id, label: b.label }))} />
              <span style={badgeStyle(settings.commBadges.find(b => b.id === badgeId), settings.badgeShape)}>
                {settings.commBadges.find(b => b.id === badgeId)?.label}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <KInput placeholder="최소 가격" value={priceMin} onChange={e => setPriceMin(e.target.value)} />
              <span style={{ color: 'var(--faint)' }}>–</span>
              <KInput placeholder="최대 가격" value={priceMax} onChange={e => setPriceMax(e.target.value)} />
            </div>
            <KInput placeholder="마감일 기준 문구" value={deadlineNote} onChange={e => setDeadlineNote(e.target.value)} />
            <KInput placeholder="문의 링크 URL (선택)" value={contactUrl} onChange={e => setContactUrl(e.target.value)} />
          </div>
        </div>

        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>슬롯 (4.18)</h4>
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="mini-seg">
              <button className={slotMode === 'shared' ? 'on' : ''} onClick={() => setSlotMode('shared')}>통합 슬롯</button>
              <button className={slotMode === 'included' ? 'on' : ''} onClick={() => setSlotMode('included')}>개별 — 통합 포함</button>
              <button className={slotMode === 'own' ? 'on' : ''} onClick={() => setSlotMode('own')}>개별 — 독립</button>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              {slotMode === 'shared' ? '전체 슬롯(환경설정 > 커미션)을 그대로 사용'
                : slotMode === 'included' ? '표시 잔여 = min(개별 잔여, 통합 잔여)'
                  : '이 커미션만의 독립 슬롯'}
            </p>
            {slotMode !== 'shared' && (
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>총</span>
                <KStep value={slotTotal} min={1} max={30} onChange={setSlotTotal} />
                <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>사용</span>
                <KStep value={slotUsed} min={0} max={slotTotal} onChange={setSlotUsed} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="mini-seg">
                {(Object.keys(SLOT_CHARS) as SlotShape[]).map(sh => (
                  <button key={sh} className={slotShape === sh ? 'on' : ''} onClick={() => setSlotShape(sh)}>
                    {SLOT_CHARS[sh].filled}{SLOT_CHARS[sh].empty}
                  </button>
                ))}
              </div>
              <span className="cp-lb">채움 색</span>
              <ColorField value={slotColor} onChange={setSlotColor} />
            </div>
          </div>
        </div>

        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>폰트 · 테마</h4>
          <div style={{ display: 'grid', gap: 9 }}>
            <KSelect value={titleFontId} onChange={setTitleFontId}
              options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: f.family }}>{f.name}</span> }))} />
            <p className="hint" style={{ margin: 0 }}>타이틀 폰트 — 상세 대형 타이틀</p>
            <KSelect value={bodyFontId} onChange={setBodyFontId}
              options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: f.family }}>{f.name}</span> }))} />
            <p className="hint" style={{ margin: 0 }}>본문 폰트 — 설명 텍스트</p>
            <div className="mini-seg">
              <button className={themeMode === 'site' ? 'on' : ''} onClick={() => setThemeMode('site')}>홈페이지 테마 그대로</button>
              <button className={themeMode === 'custom' ? 'on' : ''} onClick={() => setThemeMode('custom')}>테마컬러 입력</button>
            </div>
            {themeMode === 'custom' && (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <ColorField value={themeColor} onChange={setThemeColor} />
                  <div className="mini-seg">
                    <button className={themeTone === 'dark' ? 'on' : ''} onClick={() => setThemeTone('dark')}>다크 느낌</button>
                    <button className={themeTone === 'light' ? 'on' : ''} onClick={() => setThemeTone('light')}>라이트 느낌</button>
                  </div>
                </div>
                <span className="hint" style={{ margin: 0 }}>상세 접속 시 전체 팔레트 전환 · 벗어나면 원복</span>
              </>
            )}
          </div>
        </div>

        <div className="form-actions">
          <button className="btn btn-onbk" onClick={onCancel}>CANCEL</button>
          <button className="btn btn-accent" onClick={save}>
            {isNew ? 'ADD' : 'SAVE'}
          </button>
        </div>
      </div>

      {arts[0] && cropOpen && (
        <FirstCrop item={arts[0]} aspect={settings.ratio} crop={thumbCrop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setThumbCrop(c); setCropOpen(false); }} />
      )}
      {del.element}
    </div>
  );
}
