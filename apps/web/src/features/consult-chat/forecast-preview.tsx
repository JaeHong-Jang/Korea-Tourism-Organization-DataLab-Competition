// 게이트 A 통과 뒤 받은 숫자 카드만 미리보기로 보여 준다.
import type { ForecastCard } from "@crowdcast/contracts/types";
import { Link } from "react-router-dom";
import { RangeBar } from "../../components/charts/range-bar";
import { EmptyState } from "../../components/common/empty-state";
import { KeyNumber } from "../../components/common/key-number";
import { LevelBadge } from "../../components/common/level-badge";
import { Button } from "../../components/ui/button";
import "./forecast-preview.css";

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
          <section
            className="forecast-overview__judgment"
            aria-label="안전관리 검토 결과"
          >
            <span className="forecast-overview__eyebrow">
              안전관리 검토 결과
            </span>
            <LevelBadge judgment={card.judgment} provisional={!forecastId} />
            <p>참고용 — 담당자 검토 필수</p>
          </section>
          <div className="consult-preview__numbers forecast-overview__numbers">
            <section
              className="forecast-overview__metric"
              aria-label="동시 인원 예측"
            >
              <h3>가장 붐빌 때, 동시에 몇 명?</h3>
              <KeyNumber quantity={card.peakConcurrent} />
            </section>
            <section
              className="forecast-overview__metric"
              aria-label="하루 방문객 예측"
            >
              <h3>하루 평균, 몇 명이 방문할까?</h3>
              <KeyNumber quantity={card.dailyMean} />
            </section>
          </div>
          <p className="forecast-overview__notice">
            큰 숫자는 예측 중앙값이에요. 예상 범위를 함께 확인하세요. 순간 최대
            인원은 추정 산식 기반입니다.
          </p>
          <details className="forecast-overview__details">
            <summary>예상 범위와 기준 자세히 보기</summary>
            <RangeBar range={card.peakConcurrent} />
          </details>
          <details className="forecast-overview__details">
            <summary>예보 기준일·모델 출처</summary>
            <p className="consult-muted">
              기준일 {card.asOf}
              <br />
              예보 모델 {card.modelVersion}
            </p>
          </details>
        </>
      ) : (
        <EmptyState
          message="검증팀이 숫자를 확인하면 여기에 예보가 나타나요."
          action={
            <button
              type="button"
              onClick={() => document.getElementById("consult-text")?.focus()}
            >
              행사 설명하기
            </button>
          }
        />
      )}
      {forecastId && (
        <div className="consult-preview__actions">
          <Button asChild>
            <Link to={`/f/${encodeURIComponent(forecastId)}`}>예보서 보기</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/f/${encodeURIComponent(forecastId)}/plan`}>
              계획 초안 받기
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/my?forecastId=${encodeURIComponent(forecastId)}`}>
              저장
            </Link>
          </Button>
        </div>
      )}
      {!forecastId && <p className="consult-muted">검증팀 발행 뒤에 열려요.</p>}
    </div>
  );
}
