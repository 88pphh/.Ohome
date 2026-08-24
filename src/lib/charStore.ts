// 캐릭터·자관 데이터 저장소 — localStorage (→ Supabase 이전 예정)
// 기획서 4.4(캐릭터), 4.5(자관)
export type Visibility = 'public' | 'member' | 'private'; // 공개범위 3단계

export interface ColorChip { hex: string; label: string }

export interface CharTab {
  id: string;
  icon: string;          // 아이콘 문자 (업로드 아이콘은 후속)
  title: string;
  subtitle?: string;     // 제목 아래 작은 글씨 (선택)
  html: string;          // HTML 에디터 내용 (스크립트 불허 — 렌더 시 sanitize)
}

export interface Character {
  id: string;
  name: string;          // 대표 이름 (전용 폰트 적용 대상)
  sub: string;           // 한글명 · 소속 한 줄
  color: string;         // 대표 테마색 (말풍선·리스트 점)
  // 상세 페이지 테마 (v1.9 사용자 확정) — custom이면 대표 테마색으로 홈 팔레트 임시 전환 (4.18 방식)
  themeMode?: 'default' | 'custom';
  colors: ColorChip[];   // 테마 컬러 나열
  colorTipMode?: 'hex' | 'both' | 'label'; // 색 점 툴팁 표기: hex / 이름+hex / 이름만
  specs: { label: string; value: string }[];
  tabs: CharTab[];       // 기본 정보 외 추가 탭
  basicHtml: string;     // 기본 정보 탭의 소개 본문 (HTML)
  visibility: Visibility;
  thumbClass: string;    // 데모 플레이스홀더 클래스
  thumbId?: string;      // 리스트 썸네일 (IndexedDB, 3:4 크롭)
  thumbCrop?: import("@/components/ui/CropEditor").CropValue;
  /** 상세 페이지 중앙 아트의 위치 (v2.0) — 리스트 썸네일과 보이는 크기·비율이 달라
   *  같은 크롭을 쓰면 원하는 부분이 안 나온다. 따로 잡으면 상세에서는 이 값을 쓴다. */
  artCrop?: import("@/components/ui/CropEditor").CropValue;
  arts?: string[];       // 아트 목록 (IndexedDB — 첫 장이 대표 풀 아트이자 썸네일 원본)
  artId?: string;        // (구) 단일 풀 아트
  artUrl?: string;       // (구) 풀 아트 URL
  fontId?: string;       // 전용 폰트 — 이름·타이틀 (5.1)
  /** 상세 페이지 큰 이름의 글씨 크기 px (v2.0) — 기본 38.
   *  이름 길이가 제각각이라 자동으로 줄이면 어중간해진다. 캐릭터마다 직접 정한다. */
  nameSize?: number;
  bodyFontId?: string;   // 본문 폰트 — 프로필 정보·소개 텍스트
  own: boolean;          // true = 운영자 자캐 (리스트 노출), false = 상대 캐릭터
  // 회원-캐릭터 연결 (3차, v1.9) — 상대 캐릭터에 회원 권한 부여:
  // play = 역극에서 이 캐릭터로 발화 가능, edit = 캐릭터 편집까지 가능 (play 포함)
  grants?: CharGrant[];
  // AU별 캐릭터 프로필 (v1.9) — 키 `${relId}:${auId}`. 자관에 AU를 추가하면 멤버 캐릭터
  // 상세 우상단에 AU 리스트가 뜨고, 선택 시 프로필 전체가 이 값으로 전환.
  // 편집은 /chars/[id]/edit?au= — AU 전용 편집 페이지에서 아예 새 프로필처럼 작성 (사용자 확정)
  auProfiles?: Record<string, AuCharProfile>;
}

/** AU 캐릭터 프로필 (v1.9 전면 확장) — 이름·키·성별부터 전부 AU별로 달라질 수 있음.
 *  지정된 필드만 base를 대체 (구버전 basicHtml/arts만 있는 데이터도 그대로 동작) */
export interface AuCharProfile {
  basicHtml?: string;
  arts?: string[];
  name?: string;
  sub?: string;
  color?: string;
  themeMode?: 'default' | 'custom';
  colors?: ColorChip[];
  colorTipMode?: 'hex' | 'both' | 'label';
  specs?: { label: string; value: string }[];
  tabs?: CharTab[];
  thumbId?: string;
  thumbCrop?: import("@/components/ui/CropEditor").CropValue;
  artCrop?: import("@/components/ui/CropEditor").CropValue;   // 상세 중앙 아트 위치 (v2.0)
  fontId?: string;
  nameSize?: number;     // 상세 큰 이름 크기 px (v2.0)
  bodyFontId?: string;
}

/** AU 프로필을 합성한 표시용 캐릭터 — AU에서 지정한 필드만 대체 (상세·편집 프리필 공용) */
export function charWithAu(c: Character, auKey?: string | null): Character {
  const p = auKey ? c.auProfiles?.[auKey] : undefined;
  if (!p) return c;
  return {
    ...c,
    ...(p.name !== undefined ? { name: p.name } : {}),
    ...(p.sub !== undefined ? { sub: p.sub } : {}),
    ...(p.color !== undefined ? { color: p.color } : {}),
    ...(p.themeMode !== undefined ? { themeMode: p.themeMode } : {}),
    ...(p.colors !== undefined ? { colors: p.colors } : {}),
    ...(p.colorTipMode !== undefined ? { colorTipMode: p.colorTipMode } : {}),
    ...(p.specs !== undefined ? { specs: p.specs } : {}),
    ...(p.tabs !== undefined ? { tabs: p.tabs } : {}),
    ...(p.basicHtml !== undefined ? { basicHtml: p.basicHtml } : {}),
    ...(p.arts !== undefined ? { arts: p.arts, artId: p.arts[0] } : {}),
    ...(p.thumbId !== undefined ? { thumbId: p.thumbId } : {}),
    ...(p.thumbCrop !== undefined ? { thumbCrop: p.thumbCrop } : {}),
    ...(p.fontId !== undefined ? { fontId: p.fontId } : {}),
    ...(p.bodyFontId !== undefined ? { bodyFontId: p.bodyFontId } : {}),
  };
}

export interface CharGrant { userId: string; level: 'play' | 'edit' }

/** 회원의 캐릭터 권한 — edit는 play를 포함 */
export function charGrant(c: Character, userId?: string): 'play' | 'edit' | null {
  if (!userId) return null;
  const g = c.grants?.find(x => x.userId === userId);
  return g?.level ?? null;
}

export interface RelMember {
  charId: string;
  quote: string;                 // 캐릭터별 한마디
  keywords: string[];            // 키워드 뱃지
  desc: string;                  // 소개글
  palette: ColorChip[];          // 컬러 팔레트 아이콘
  linkedNote?: string;           // "회원 ○○ 연결됨" 등
  fullImgId?: string;            // 전신 이미지 (v1.9 — 자관 수정에서 등록, 중앙 전신 모드)
  fullScale?: number;            // 전신 크기 % (비율 유지, 미리보기 휠로 조절 — 기본 90)
  fullOffX?: number;             // 전신 가로 위치 오프셋 % (미리보기 드래그 — 기본 0, v1.9)
  fullOffY?: number;             // 전신 세로 위치 오프셋 % (기본 0 = 하단 밀착)
  /** 멤버 카드 얼굴칸(1:1) 크롭 (v2.0) — 캐릭터의 리스트 썸네일은 3:4라
   *  정사각 칸에 그대로 쓰면 어긋난다. 자관에서 따로 잡아 저장한다. */
  faceCrop?: import('@/components/ui/CropEditor').CropValue;
  /** 멤버 카드 이름 크기 px (v2.0) — 기본 17. 카드 폭이 좁아 이름마다 알맞은 크기가 다르다 */
  nameSize?: number;
  quoteColor?: string;           // 히어로 대사 글씨색 (페어, v1.9 — 기본 #d7dae0)
  quoteMarkColor?: string;       // 히어로 대사 따옴표색 (기본 포인트 소프트)
}

export interface TlSay { charId: string; text: string }
export interface TlItem { era?: string; desc?: string; says: TlSay[] }

export interface QaAnswer {
  charId: string; text: string;
  note?: string;      // 오너 부연설명 — 말풍선 호버 툴팁 (수정 모달에서 관리자가 작성, v1.9)
  authorId?: string;  // 작성 회원 (v1.9 — 본인 수정, 본인·관리자 삭제 판정)
}
export interface QaEntry {
  no: number; q: string; date: string; answers: QaAnswer[];
  note?: string;   // 질문에 대한 오너 설명 — 질문 아래에 표시 (관리자만 작성, v2.0)
}

/** CP/NCP 구분 (v1.9) — CP=커플, NCP=커플 아님. 자관 기본값 + AU마다 별개 지정 가능 */
export type RelCpTag = 'cp' | 'ncp';

/** AU 한 항목 (v1.9 확장) — 캐치프레이즈만이 아니라 프로필 전체가 AU별로 분리:
 *  중앙 일러(arts)·타임라인·문답·CP/NCP. base(원본)는 Relation 최상위 필드를 그대로 사용 (기존 데이터 호환) */
export interface RelAu {
  id: string;
  label: string;
  catchphrase: string;
  quotes?: string[];
  cp?: RelCpTag;          // 없으면 자관 기본(Relation.cp)
  arts?: string[];        // AU별 중앙/그룹 일러 (base는 Relation.arts)
  timeline?: TlItem[];    // base는 Relation.timeline
  questions?: QaEntry[];  // base는 Relation.questions
  qaPool?: string[];      // 대기 질문 풀 (v1.9 — 리스트에서 담은 미출제 질문, 랜덤 출제 대기)
  qaEnabled?: boolean;    // QUESTIONS 섹션 사용 여부 (＋로 추가해야 생김, base는 Relation.qaEnabled)
  fulls?: Record<string, string>;  // AU별 전신 이미지 (charId → blob id, 없으면 멤버 공통 전신)
  headerImgId?: string | null;     // AU별 헤더 이미지 (v1.9) — base를 물려받지 않음, 이 AU 것만
  headerCrop?: import("@/components/ui/CropEditor").CropValue;
  // AU별 페이지 테마 (v1.9 사용자 확정) — 미지정이면 base(원본) 테마 따라가기
  theme?: { mode: 'site' | 'custom'; color?: string; tone?: 'dark' | 'light' };
}

export interface Relation {
  id: string;
  name: string;
  catchphrase: string;
  kind?: 'pair' | 'multi';         // 페어(2인) / 다인(3인+) — 등록 시 선택
  fontId?: string;               // 자관 이름 폰트 (4.5 필수 요구 — 5.1 라이브러리)
  bodyFontId?: string;           // 본문 폰트 — 카드 소개·타임라인·문답 텍스트
  arts?: string[];               // 아트 목록 (첫 장 = 대표 = 리스트 썸네일 원본)
  headerImgId?: string;          // 헤더 이미지 (v1.5 — 상단 풀폭 블러 + 페이드아웃)
  headerCrop?: import("@/components/ui/CropEditor").CropValue; // 헤더 이미지 위치 크롭 (원본 무손실)
  themeMode?: 'site' | 'custom'; // 페이지 테마: 홈페이지 그대로 / 별도 테마컬러 (4.18 방식)
  themeColor?: string;           // 별도 테마컬러 (custom일 때)
  themeTone?: 'dark' | 'light';  // 테마컬러의 다크/라이트 느낌
  illuBg?: string;               // 전신/일러 스위치 배경색 (v1.9 — 미지정: 테마 진한 버튼색 기반)
  illuOn?: string;               // 전신/일러 스위치 선택색 (미지정: 포인트색)
  nameColor?: string;            // 자관명(히어로 타이틀) 글씨색 (v1.9 — 미지정: 테마)
  cpColor?: string;              // 캐치프레이즈 글씨색 (미지정: 테마)
  cpTagBg?: string;              // CP/NCP 뱃지 배경색 (v2.0 — 미지정: 기본 pill)
  cpTagFg?: string;              // CP/NCP 뱃지 글씨색 (v2.0)
  thumbId?: string;              // 리스트 썸네일 (IndexedDB, 4:3 크롭)
  thumbCrop?: import("@/components/ui/CropEditor").CropValue;
  members: RelMember[];          // 2인 = 좌/우, 3인+ = 다인 리스트
  visibility: Visibility;
  thumbClass: string;
  illustMode: 'duo' | 'one';     // 2인: 전신 2장 / 일러 1장 (v1.8)
  aus: RelAu[];                  // AU 리스트 (첫 항목 = 원본 base)
  cp?: RelCpTag;                 // 자관 기본 CP/NCP (등록 시 선택, v1.9)
  fullFront?: string;            // 전신 모드에서 앞에 보일 캐릭터 id (v1.9 — 미리보기에서 클릭 선택)
  pairRight?: string;            // 페어에서 오른쪽 자리에 둘 캐릭터 id (v2.0 — 없으면 등록 순서대로)
  timeline: TlItem[];            // base AU의 타임라인
  questions: QaEntry[];          // base AU의 문답
  qaPool?: string[];             // base AU의 대기 질문 풀 (v1.9 — 랜덤 출제 대기)
  qaEnabled?: boolean;           // base AU의 QUESTIONS 섹션 사용 여부 (구버전은 questions 존재로 판정)
}

export const CHAR_SEED: Character[] = [];

export const REL_SEED: Relation[] = [];

export const findChar = (chars: Character[], id: string) => chars.find(c => c.id === id);
