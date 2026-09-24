// 개발 중 부품 견본을 확인할 수 있는 비공개 메뉴 화면이다.
import { PageHeading } from "../components/common/page-heading";
import { Button } from "../components/ui/button";

// 공용 버튼의 세 모양을 같은 토큰 환경에서 확인한다.
export function DevPage() {
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
