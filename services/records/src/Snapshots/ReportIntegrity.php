<?php
// 발행 예보서의 문서 내부 참조와 기준 그래프 참조를 계약 규칙으로 검사한다
declare(strict_types=1);

namespace CrowdCast\Records\Snapshots;

use RuntimeException;

// 계약 refProblems(doc, "forecast-report", master)의 세션 없는 판정을 옮긴다
final class ReportIntegrity
{
    private const REF_KEYS = [
        'evidenceId' => 'evidence', 'evidenceIds' => 'evidence',
        'quantityId' => 'quantities', 'quantityIds' => 'quantities',
        'observationIds' => 'observations', 'assumptionId' => 'assumptions',
        'assumptionIds' => 'assumptions', 'caseEventId' => 'caseEvents',
        'claimIds' => 'claims', 'ruleId' => 'rules', 'ruleIds' => 'rules',
        'clauseId' => 'clauses', 'datasetId' => 'datasets', 'modelRunId' => 'modelRuns',
    ];
    private const PREFIXES = [
        'q-' => 'quantities', 'ev-' => 'evidence', 'obs-' => 'observations',
        'as-' => 'assumptions', 'c-' => 'claims', 'e-' => 'events', 'f-' => 'forecasts',
    ];

    /** @var array<string, array<string, true>> */
    private array $master;

    // 기준 id는 계약의 master-ids.json에서 읽는다. 모델 실행(mr-)은 계속 새로 등록되므로 발행 시점에 근거 그래프가 확인한다(여기서는 형식만)
    public function __construct()
    {
        $root = dirname(__DIR__, 4) . '/packages/contracts';
        $json = file_get_contents($root . '/jsonld/master-ids.json');
        if ($json === false) {
            throw new RuntimeException('기준 그래프 ID 목록을 읽을 수 없습니다');
        }
        $ids = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        foreach (['datasets', 'clauses', 'rules', 'assumptions', 'agents'] as $kind) {
            $this->master[$kind] = array_fill_keys($ids[$kind] ?? [], true);
        }
    }

    // 같은 id 정의, 참조, 자리표시자, 예보서 문맥 규칙의 문제를 모은다
    /** @return list<string> */
    public function problems(object $report): array
    {
        $definitions = [];
        $references = [];
        $problems = [];
        $this->visit($report, $definitions, $references, $problems);

        // 유사 행사 id는 문서 내부에서 사례 정의로 취급한다
        $caseEvents = [];
        $similarDefinitions = [];
        foreach ($report->similar as $similar) {
            $caseEvents[$similar->eventId] = true;
            $previous = $similarDefinitions[$similar->eventId] ?? null;
            $current = CardProjection::canonical($similar);
            if ($previous !== null && $previous !== $current) {
                $problems[] = "같은 유사 사례 {$similar->eventId}에 다른 내용";
            }
            $similarDefinitions[$similar->eventId] = $current;
        }
        foreach ($references as [$key, $id]) {
            $where = self::REF_KEYS[$key];
            if ($where === 'caseEvents') {
                $found = isset($caseEvents[$id]);
            } elseif ($where === 'modelRuns') {
                // 등록 여부는 발행 때 근거 그래프가 본다 — 새 모델을 등록해도 과거 스냅샷 조회가 깨지지 않게 형식만 확인
                $found = preg_match('/^mr-[a-z0-9][a-z0-9_.:-]{1,120}$/D', $id) === 1;
            } elseif (in_array($where, ['rules', 'clauses', 'datasets'], true)) {
                $found = isset($this->master[$where][$id]);
            } elseif ($where === 'assumptions' && empty($definitions['assumptions'])) {
                $found = isset($this->master['assumptions'][$id]);
            } else {
                $found = isset($definitions[$where][$id]);
            }
            if (!$found) {
                $problems[] = "{$key} → {$id} 없음";
            }
        }

        // 문서가 직접 정의한 가정도 기준 그래프에 등록돼야 한다
        foreach (array_keys($definitions['assumptions'] ?? []) as $id) {
            if (!isset($this->master['assumptions'][$id])) {
                $problems[] = "assumption {$id} 기준 그래프에 없음";
            }
        }
        $this->placeholders($report, $definitions['quantities'] ?? [], $problems);
        $this->reportProblems($report, $problems);
        return $problems;
    }

    // 카드를 제외한 모든 객체 정의와 참조 칸을 재귀적으로 모은다
    /** @param array<string, array<string, object>> $definitions
     *  @param list<array{string, string}> $references
     *  @param list<string> $problems
     */
    private function visit(
        mixed $node,
        array &$definitions,
        array &$references,
        array &$problems,
        bool $inCard = false
    ): void
    {
        if (is_array($node)) {
            foreach ($node as $item) {
                $this->visit($item, $definitions, $references, $problems, $inCard);
            }
            return;
        }
        if (!is_object($node)) {
            return;
        }

        // 카드는 정의에서 빼되 참조 칸은 모든 객체에서 찾는다
        if (!$inCard && isset($node->id) && is_string($node->id)) {
            foreach (self::PREFIXES as $prefix => $kind) {
                if (str_starts_with($node->id, $prefix)) {
                    $previous = $definitions[$kind][$node->id] ?? null;
                    if ($previous !== null && CardProjection::canonical($previous) !== CardProjection::canonical($node)) {
                        $problems[] = "같은 id {$node->id}에 다른 내용";
                    }
                    $definitions[$kind][$node->id] = $node;
                    break;
                }
            }
        }
        foreach (get_object_vars($node) as $field => $value) {
            if (isset(self::REF_KEYS[$field])) {
                foreach (is_array($value) ? $value : [$value] as $id) {
                    if (is_string($id)) {
                        $references[] = [$field, $id];
                    }
                }
            }
            $this->visit($value, $definitions, $references, $problems, $inCard || $field === 'card');
        }
    }

    // 문장의 자리표시자가 null 수치를 인용하는지 검사한다
    /** @param array<string, object> $quantities
     *  @param list<string> $problems
     */
    private function placeholders(mixed $node, array $quantities, array &$problems): void
    {
        if (is_array($node)) {
            foreach ($node as $item) {
                $this->placeholders($item, $quantities, $problems);
            }
            return;
        }
        if (!is_object($node)) {
            return;
        }
        foreach (is_array($node->placeholders ?? null) ? $node->placeholders : [] as $placeholder) {
            $quantity = $quantities[$placeholder->quantityId] ?? null;
            if ($quantity !== null && ($quantity->{$placeholder->field} ?? null) === null) {
                $problems[] = "{$node->id} 자리표시자 {$placeholder->name} → {$placeholder->quantityId}.{$placeholder->field}이 비었다";
            }
        }
        foreach (get_object_vars($node) as $value) {
            $this->placeholders($value, $quantities, $problems);
        }
    }

    // 머리·카드·근거 합집합·사례·평시·문장 검사를 계약 reportProblems와 맞춘다
    /** @param list<string> $problems */
    private function reportProblems(object $report, array &$problems): void
    {
        $forecast = $report->forecast;
        if ($forecast->id !== $report->forecastId) {
            $problems[] = 'forecast.id와 forecastId 불일치';
        }
        if ($forecast->eventId !== $report->event->id) {
            $problems[] = 'forecast.eventId와 event.id 불일치';
        }
        foreach (CardProjection::diff($report->card, $forecast) as $field) {
            $problems[] = "card.{$field}가 forecast 투영과 다름";
        }

        // 근거 묶음은 예보·유사 행사·평시 근거 id의 합집합이다
        $sources = $forecast->evidence;
        foreach ($report->similar as $similar) {
            $sources = array_merge($sources, $similar->evidence);
            if (!$this->containsId($similar->evidence, $similar->evidenceId)) {
                $problems[] = "similar {$similar->eventId}의 자체 근거 없음";
            }
        }
        if ($report->baseline !== null) {
            $sources = array_merge($sources, $report->baseline->evidence);
            if (!$this->containsId($report->baseline->evidence, $report->baseline->evidenceId)) {
                $problems[] = 'baseline의 자체 근거 없음';
            }
            if ($report->baseline->sigunguCode !== $report->event->sigunguCode) {
                $problems[] = 'baseline 지역과 행사 지역 불일치';
            }
        }
        $wanted = array_fill_keys(array_map(static fn(object $e): string => $e->id, $sources), true);
        $actual = array_fill_keys(array_map(static fn(object $e): string => $e->id, $report->evidence), true);
        if (array_diff_key($wanted, $actual) !== [] || array_diff_key($actual, $wanted) !== []) {
            $problems[] = 'evidence 묶음이 출처의 합집합과 다름';
        }
        foreach ($report->evidence as $evidence) {
            if ($evidence->forecastId && $evidence->forecastId !== $forecast->id) {
                $problems[] = "evidence {$evidence->id}가 다른 예보를 참조";
            }
        }
        foreach ($report->claims as $claim) {
            if ($claim->sessionId !== $report->sessionId || $claim->forecastId !== $report->forecastId) {
                $problems[] = "claim {$claim->id}의 세션 또는 예보 불일치";
            }
            foreach ($claim->checks as $check) {
                // 7과 7.0은 같은 revision이다(스키마 integer는 둘 다 허용)
                if ((float) $check->revision !== (float) $report->revision) {
                    $problems[] = "claim {$claim->id}의 검사 revision 불일치";
                }
            }
        }
    }

    // 유사 행사와 평시의 대표 근거가 자기 목록에 있는지 본다
    /** @param list<object> $evidence */
    private function containsId(array $evidence, string $id): bool
    {
        foreach ($evidence as $item) {
            if ($item->id === $id) {
                return true;
            }
        }
        return false;
    }
}
