// 예보팀 열세 펫의 다섯 표정을 낮과 밤에서 비교하는 견본이다.
import type { AgentStatus } from "@crowdcast/contracts/types";
import { PET_AGENT_IDS, PetAvatar } from "./pet-avatar";

const STATES: { state: AgentStatus["state"]; title: string }[] = [
  { state: "idle", title: "대기 · 깜빡임" },
  { state: "working", title: "작업 · 살짝 통통 + 물 분수" },
  { state: "done", title: "완료 · 눈웃음" },
  { state: "waiting", title: "보류 · 지느러미 들기" },
  { state: "error", title: "오류 · 엑스 눈" },
];

// 계약의 blocked도 보류 표정을 쓰므로 보류 열에서 함께 설명한다.
export function PetsGallery() {
  return (
    <section className="page-wrap pets-gallery" aria-label="예보팀 펫 견본">
      <div className="pets-gallery__intro">
        <PetAvatar agentId="lead" state="working" size={96} />
        <div>
          <span className="eyebrow">개발용 견본</span>
          <h1>예보팀 펫</h1>
          <p>팀장과 세 팀의 이름표, 역할 표식, 상태 표정을 한눈에 확인해요.</p>
          <p>응답 대기와 보류는 같은 표정이에요.</p>
        </div>
      </div>
      <div className="pets-gallery__grid">
        {STATES.map(({ state, title }) => (
          <section
            className="pets-gallery__state"
            key={state}
            aria-label={title}
          >
            <h2>{title}</h2>
            <div className="pets-gallery__list">
              {PET_AGENT_IDS.map((agentId) => (
                <PetAvatar
                  key={agentId}
                  agentId={agentId}
                  state={state}
                  size={48}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
