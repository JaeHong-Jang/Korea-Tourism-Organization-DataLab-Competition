// 개발 실행기의 기본 포트와 환경 변수 주소 해석을 검증한다
import { describe, expect, it } from "vitest";
import { readConfig } from "../src/config.js";

// 실제 .env를 읽거나 출력하지 않고 명시한 설정만 확인한다
describe("게이트웨이 설정", () => {
  // 단독 workspace dev 실행도 표준 서비스 포트를 사용해야 한다
  it("개발 실행기의 기본 포트를 따른다", () => {
    expect(readConfig({})).toEqual({
      port: 8787,
      services: {
        forecast: "http://127.0.0.1:8010",
        knowledge: "http://127.0.0.1:8020",
        records: "http://127.0.0.1:8030",
      },
      ollamaHost: "http://127.0.0.1:11434",
    });
  });

  // dev.mjs의 Ollama 설정과 서비스별 재지정 주소를 그대로 사용한다
  it("환경 변수 주소와 스킴 없는 Ollama 호스트를 정규화한다", () => {
    expect(
      readConfig({
        GATEWAY_PORT: "8788",
        FORECAST_URL: "http://localhost:9010/",
        KNOWLEDGE_URL: "http://localhost:9020/",
        RECORDS_URL: "http://localhost:9030/",
        OLLAMA_HOST: "127.0.0.1:11435",
      }),
    ).toEqual({
      port: 8788,
      services: {
        forecast: "http://localhost:9010",
        knowledge: "http://localhost:9020",
        records: "http://localhost:9030",
      },
      ollamaHost: "http://127.0.0.1:11435",
    });
  });

  // 잘못된 포트는 리스너를 열기 전에 거부한다
  it.each(["0", "65536", "8787.5", "잘못된 포트"])(
    "잘못된 포트 %s를 거부한다",
    (port) => {
      expect(() => readConfig({ GATEWAY_PORT: port })).toThrow("GATEWAY_PORT");
    },
  );
});
