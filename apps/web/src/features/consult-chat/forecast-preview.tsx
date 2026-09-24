// 게이트 A 통과 뒤 받은 숫자 카드만 미리보기로 보여 준다.
import type { ForecastCard } from "@crowdcast/contracts/types";
import { Link } from "react-router-dom";
import { RangeBar } from "../../components/charts/range-bar";
import { KeyNumber } from "../../components/common/key-number";
import { LevelBadge } from "../../components/common/level-badge";
import { Button } from "../../components/ui/button";

// 발행 id가 없으면 세 행동의 이유를 함께 알려 준다.
export function ForecastPreview({
  card,
  forecastId,
}: {
  card: ForecastCard | null;
  forecastId: string | null;
}) {
  return (
    <div className="consult-preview">
      {card ? (
        <>
          <div className="consult-preview__numbers">
            <KeyNumber quantity={card.peakConcurrent} />
            <KeyNumber quantity={card.dailyMean} />
          </div>
          <LevelBadge judgment={card.judgment} provisional={!forecastId} />
          <RangeBar range={card.peakConcurrent} />
          <p className="consult-muted">
            숫자 출처: 예보 모델 {card.modelVersion} · 기준일 {card.asOf}
            <br />
            참고용 — 담당자 검토 필수 · 추정 산식 기반
          </p>
        </>
      ) : (
        <p className="consult-muted">
          검증팀이 숫자를 확인하면 여기에 예보가 나타나요.
        </p>
      )}
      <div className="consult-preview__actions">
        {forecastId ? (
          <Button asChild variant="outline">
            <Link to={`/f/${encodeURIComponent(forecastId)}`}>전체 예보서</Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            전체 예보서
          </Button>
        )}
        {forecastId ? (
          <Button asChild variant="outline">
            <Link to={`/f/${encodeURIComponent(forecastId)}?tab=plan`}>
              계획 초안 받기
            </Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            계획 초안 받기
          </Button>
        )}
        {forecastId ? (
          <Button asChild variant="outline">
            <Link to={`/my?forecastId=${encodeURIComponent(forecastId)}`}>
              저장
            </Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            저장
          </Button>
        )}
      </div>
      {!forecastId && <p className="consult-muted">검증팀 발행 뒤에 열려요.</p>}
    </div>
  );
}
