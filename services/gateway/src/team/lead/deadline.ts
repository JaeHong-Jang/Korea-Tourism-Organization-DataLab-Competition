// 전체 요청 마감과 남은 단계 수로 팀원별 호출 예산을 제한한다
import {
  RequestTimeoutError,
  withRequestDeadline,
} from "../../clients/request-deadline.js";

// 실패나 연결 종료도 같은 취소 신호로 모든 병렬 호출에 전파한다
export class Deadline {
  readonly controller = new AbortController();
  private readonly expiresAt: number;
  private readonly timer: ReturnType<typeof setTimeout>;

  // 단조 시계를 써 시스템 시각 변경에도 요청 예산을 유지한다
  constructor(readonly timeoutMs = 20_000) {
    this.expiresAt = performance.now() + timeoutMs;
    this.timer = setTimeout(
      () => this.abort(new RequestTimeoutError(timeoutMs)),
      timeoutMs,
    );
  }

  // 남은 단계에 시간을 남겨 두되 팀원의 최대 예산을 넘지 않는다
  budget(maximum: number, stagesLeft = 1) {
    this.check();
    return Math.max(
      1,
      Math.min(
        maximum,
        Math.floor((this.expiresAt - performance.now()) / stagesLeft),
      ),
    );
  }

  // 동기 작업 이후에도 마감이 지난 결과는 다음 단계로 보내지 않는다
  check() {
    if (performance.now() >= this.expiresAt)
      this.abort(new RequestTimeoutError(this.timeoutMs));
    this.controller.signal.throwIfAborted();
  }

  // 팀원 실행 전체를 감싸 취소를 무시한 호출이 뒤늦게 완료되는 경우도 격리한다
  run<T>(budgetMs: number, operation: (signal: AbortSignal) => Promise<T>) {
    this.check();
    return withRequestDeadline(budgetMs, operation, this.controller.signal);
  }

  abort(reason: unknown) {
    this.controller.abort(reason);
  }
  dispose() {
    clearTimeout(this.timer);
  }
}
