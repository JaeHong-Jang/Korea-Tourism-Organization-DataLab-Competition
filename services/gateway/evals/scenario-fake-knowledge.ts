// 평가용 가짜 knowledge는 소켓 없이 계약 참조·수명 주기와 발행 검사를 적용한다

import assert from "node:assert/strict";
import masterIds from "@crowdcast/contracts/jsonld/master-ids.json";
import {
  factsTransitionProblems,
  publishProblems,
  // @ts-expect-error 계약 수명 주기는 JavaScript로 배포된다
} from "@crowdcast/contracts/rules/claim-lifecycle.mjs";
// @ts-expect-error 계약 규칙은 JavaScript로 배포된다
import * as integrity from "@crowdcast/contracts/rules/integrity.mjs";
import type { Claim, Forecast, GateReport } from "@crowdcast/contracts/types";
import type { SessionFacts } from "../src/contract/session-facts.js";

type Loaded = { schema: string; doc: unknown; via?: string };

// 테스트 저장소는 앱마다 분리하고 읽은 예보서도 실제 계약 참조 검사에 넣는다
export function scenarioKnowledge() {
  const sessions = new Map<string, Loaded[]>();
  const revisions = new Map<string, number>();
  const master = integrity.masterSets(masterIds, ["mr-v0-1-0"]);
  const respond = (url: URL, body: SessionFacts | undefined) => {
    if (url.pathname === "/v1/master/version")
      return Response.json({ masterVersion: 7 });
    if (url.pathname === "/v1/events") return Response.json(body);
    if (/\/snapshots$/.test(url.pathname)) {
      assert.deepEqual(
        integrity.refProblems(body, "forecast-report", master),
        [],
      );
      return Response.json(body);
    }
    const match = url.pathname.match(
      /^\/v1\/sessions\/(s-[^/]+)\/(facts|validate|publish)$/,
    );
    if (!match) return;
    const [, id, action] = match;
    const loaded = sessions.get(id) ?? [];
    let revision = revisions.get(id) ?? 0;
    const scope = integrity.sessionScope(id, loaded, revision);
    if (action === "facts" && body) {
      // 허용되지 않는 문장 상태 전이는 실제 knowledge처럼 무결성 게이트 422로 거부한다
      if (body.schema === "claim") {
        const problems = body.items.flatMap((doc) =>
          (
            factsTransitionProblems(
              scope.claims.get((doc as Claim).id),
              doc,
            ) as string[]
          ).map((message) => ({ nodeId: (doc as Claim).id, message })),
        );
        if (problems.length)
          return Response.json(
            {
              gate: "integrity",
              passed: false,
              revision,
              masterVersion: 7,
              violations: problems.map(({ nodeId, message }) => ({
                check: "integrity",
                shapeId: null,
                nodeId,
                message,
              })),
            },
            { status: 422 },
          );
      }
      assert.deepEqual(
        body.items.flatMap((doc) =>
          integrity.refProblems(doc, body.schema, master, scope),
        ),
        [],
      );
      if (
        body.items.some((doc) =>
          integrity.changesContent(scope, body.schema, doc),
        )
      )
        revision++;
      loaded.push(...body.items.map((doc) => ({ schema: body.schema, doc })));
      sessions.set(id, loaded);
      revisions.set(id, revision);
      return Response.json({ revision });
    }

    // 요청한 검사 범위와 검사 결과 revision이 일치해야 한다
    assert.equal(url.searchParams.get("revision"), String(revision));
    assert.equal(url.searchParams.get("masterVersion"), "7");
    const gate =
      action === "publish"
        ? "publish"
        : url.searchParams.get("shapes")?.includes("S01")
          ? "B"
          : "A";
    const violations: GateReport["violations"] = [];
    const claims = [...scope.claims.values()] as Claim[];
    if (gate !== "A")
      for (const claim of claims) {
        const forecast = scope.forecasts.get(claim.forecastId) as Forecast;
        const problems =
          claim.status === "candidate"
            ? (publishProblems(claim, revision) as string[])
            : [];
        if (
          ["candidate", "published"].includes(claim.status) &&
          !claim.evidenceIds.length
        )
          problems.push("S01");
        if (
          forecast.ood &&
          ["판정", "권고"].includes(claim.claimType) &&
          !claim.evidenceIds.some((id) => {
            const item = scope.evidence.get(id);
            return (
              item?.kind === "check" &&
              item.forecastId === forecast.id &&
              item.checkResult?.passed &&
              ["ood", "uncertainty"].includes(item.checkResult.checkKind)
            );
          })
        )
          problems.push("S10");
        for (const message of problems)
          violations.push({
            check: "shacl",
            shapeId: message === "S10" ? "S10" : "S12",
            nodeId: claim.id,
            message,
          });
      }

    // 발행은 candidate만 같은 revision의 검사로 원자적으로 전환한다
    if (gate === "publish" && !violations.length) {
      const candidates = claims.filter((claim) => claim.status === "candidate");
      assert.ok(candidates.length > 0);
      loaded.push(
        ...candidates.map((doc) => ({
          schema: "claim",
          doc: { ...doc, status: "published" },
          via: "publish",
        })),
      );
    }
    return Response.json({
      gate,
      passed: !violations.length,
      revision,
      masterVersion: 7,
      violations,
    });
  };
  // 실제 가짜 저장소의 마지막 상태를 읽어 실패 뒤 남은 후보와 발행 문장을 확인한다
  return Object.assign(respond, {
    claims(id: string): Claim[] {
      const scope = integrity.sessionScope(
        id,
        sessions.get(id) ?? [],
        revisions.get(id) ?? 0,
      );
      return structuredClone([...scope.claims.values()]);
    },
  });
}
