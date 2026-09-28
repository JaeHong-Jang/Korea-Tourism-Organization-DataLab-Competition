// 새 연구 결과와 선택한 발행 예보의 모델 상태를 혼동하지 않게 안내한다.
import { Link } from "react-router-dom";
import { researchValidation } from "../validation/research-validation-data";

// 연구 모델의 입력·출력·검증 범위를 예보 근거 페이지의 첫 근거로 제시한다.
export function ResearchModelEvidence() {
  const data = researchValidation;
  return (
    <aside
      className="research-evidence"
      aria-labelledby="research-evidence-title"
    >
      <div className="research-evidence__heading">
        <div>
          <span>{data.status}</span>
          <h2 id="research-evidence-title">모델 연구 근거</h2>
        </div>
        <Link to="/validation#research-signed-model">검증 결과 보기 →</Link>
      </div>
      <ol>
        <li>
          <strong>입력</strong>
          <p>행사 정보와 개최 14일 전까지 공개된 시군구 평시 방문 자료</p>
        </li>
        <li>
          <strong>예측값</strong>
          <p>{data.target} · 음수도 그대로 보존</p>
        </li>
        <li>
          <strong>검증</strong>
          <p>
            2025년 {data.evaluation[0].events}건, 2026년 1~8월{" "}
            {data.evaluation[1].events}건의 시간순 평가
          </p>
        </li>
        <li>
          <strong>적용 범위</strong>
          <p>{data.caveat}</p>
        </li>
      </ol>
      <p className="research-evidence__notice">
        아래에서 여는 예보서는 발행 당시 저장된 모델 버전의 기록입니다. 이 연구
        후보의 수치로 바뀐 것이 아닙니다.
      </p>
    </aside>
  );
}
