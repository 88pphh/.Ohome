import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/lib/ThemeProvider';
import { AuthProvider } from '@/lib/auth';
import { MainStoreProvider } from '@/lib/mainStore';
import { BgmStoreProvider } from '@/lib/bgmStore';
import { FontProvider } from '@/lib/fontStore';
import { ToastProvider } from '@/components/ui/Toast';
import { TopBar } from '@/components/shell/TopBar';
import { BgmPlayer } from '@/components/shell/BgmPlayer';
import { TipLayer } from '@/components/ui/TipLayer';
import { CursorLayer } from '@/components/shell/CursorLayer';
import { ImgProtect } from '@/components/shell/ImgProtect';
import { SetupGate } from '@/components/shell/SetupGate';
import { DocTitle } from '@/components/shell/DocTitle';
import { PageFrame } from '@/lib/pageRefresh';
import { ServerBoot } from '@/components/shell/ServerBoot';

export const metadata: Metadata = {
  title: 'O.HOME — 개인홈',
  description: '자캐놀이용 개인 아카이브',
};

// 서버 함수 리전은 코드로 못 정한다 — preferredRegion은 이 Next 버전에서 deprecated이고,
// vercel.json의 regions는 새 프로젝트에서도 적용되지 않는 것을 실측으로 확인했다.
// Vercel 프로젝트 Settings > Functions > Function Region에서 직접 지정 후 재배포해야 한다(설치 안내 2-B ④).

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Noto+Serif+KR:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* 테마 FOUC 방지 — 저장해 둔 CSS 변수 맵을 첫 페인트 전에 적용 (기본 다크 → 사용자 테마 깜빡임 제거) */}
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{var m=JSON.parse(localStorage.getItem('ohome.themeCss.v1'));if(m){var s=document.documentElement.style;for(var k in m)s.setProperty(k,m[k]);}}catch(e){}})();`,
        }} />
        {/* 서버 연결 확정 후에 앱을 그림 — 설정(ohome.config.json/로컬/env)을 한 번 읽는다 (v2.0) */}
        <ServerBoot>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <FontProvider>
              <MainStoreProvider>
                <BgmStoreProvider>
                  {/* 설치 초기 화면 — 첫 실행이면 관리자·게스트 설정/백업 복원만 표시 (v1.9) */}
                  <SetupGate>
                  <TopBar />
                  {/* 앱 셸: 스크롤은 이 영역 안에서만 (7장) */}
                  {/* PageFrame: 같은 메뉴를 다시 누르면 이 안쪽만 remount (BGM·상단바는 유지, v1.9) */}
                  <main id="appMain"><PageFrame>{children}</PageFrame></main>
                  {/* BGM 미니 플레이어 — 전역 상주, 페이지 이동에도 유지 (4.1) */}
                  <BgmPlayer />
                  {/* 전역 커스텀 툴팁 — data-tip 요소 공통 (7장) */}
                  <TipLayer />
                  {/* 커스텀 마우스 커서 (5.1) */}
                  <CursorLayer />
                  {/* 이미지 저장 방지 — 메뉴 관리 > 권한에서 영역별 지정 (v1.9) */}
                  <ImgProtect />
                  {/* 브라우저 탭 제목 — 디자인 탭에서 지정 (v1.9) */}
                  <DocTitle />
                  </SetupGate>
                </BgmStoreProvider>
              </MainStoreProvider>
              </FontProvider>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
        </ServerBoot>
      </body>
    </html>
  );
}
