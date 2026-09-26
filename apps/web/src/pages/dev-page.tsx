// 개발 중 부품 견본을 확인할 수 있는 비공개 메뉴 화면이다.

import { PageHeading } from "../components/common/page-heading";
import { PetsGallery } from "../components/pets";
import { Button } from "../components/ui/button";
import { Venue3D } from "../features/venue-3d/venue-3d";
import { KitPage } from "./dev/kit-page";

// 공용 버튼의 세 모양을 같은 토큰 환경에서 확인한다.
export function DevPage() {
  if (window.location.pathname === "/dev/pets") return <PetsGallery />;
  if (window.location.pathname === "/dev/kit") return <KitPage />;
  const venueKey = window.location.pathname.match(
    /^\/dev\/venue\/(yeongjong|hangang|suwon)$/,
  )?.[1];
  if (venueKey)
    return (
      <div className="page-wrap">
        <Venue3D sampleKey={venueKey as "yeongjong" | "hangang" | "suwon"} />
      </div>
    );
  return (
    <div className="page-wrap regular-page">
      <PageHeading
        eyebrow="개발용 견본"
        title="부품 견본"
        description="공용 부품의 테마와 키보드 포커스를 확인하세요."
      />
      <div className="dev-buttons">
        <Button>기본 버튼</Button>
        <Button variant="outline">보조 버튼</Button>
        <Button variant="ghost">문장 버튼</Button>
      </div>
    </div>
  );
}
