<?php
// 스냅샷의 근거 종류별 필드를 문장 각주에 읽을 수 있게 조합한다
declare(strict_types=1);

namespace CrowdCast\Records\Plans;

// 자료·모델·규칙·가정·사례의 근거 출처를 각각 표시한다
final class EvidenceLabel
{
    // 종류별로 실제 스냅샷 필드만 사용해 각주 문구를 만든다
    /**
     * @param array<string, mixed> $evidence
     * @param array<string, mixed> $report
     */
    public function format(array $evidence, array $report): string
    {
        $title = $evidence['title'];
        return match ($evidence['kind']) {
            'data' => $title . ' · ' . $this->source($evidence['source']) . ' · 기간 '
                . $this->period($evidence['period']) . ' · 공개일 ' . ($evidence['availableAt'] ?? '미기재'),
            'model' => $title . ' · 모델 ' . ($evidence['modelVersion'] ?? '미기재') . ' · 학습 범위 '
                . $this->period($report['forecast']['predictionRun']['trainRange'] ?? $evidence['period']),
            'rule' => $title . ' · ' . $this->ruleKind($evidence['ruleId'], $report)
                . ($evidence['clauseId'] === null ? '' : ' · 조항 ' . $evidence['clauseId']),
            'assumption' => $title . ' · ' . ($evidence['summary'] === '' ? '미기재' : $evidence['summary']),
            'case' => $title . ' · 행사 ' . ($evidence['caseEventId'] ?? '미기재')
                . ' · 기간 ' . $this->period($evidence['period']),
            default => $title . ' · ' . ($evidence['summary'] === '' ? '미기재' : $evidence['summary']),
        };
    }

    // 데이터 출처의 발행처와 자료명을 함께 쓴다
    /** @param array<string, mixed>|null $source */
    private function source(?array $source): string
    {
        return $source === null ? '출처 미기재' : $source['publisher'] . ' · ' . $source['title'];
    }

    // 자료 기간이나 학습 범위가 없는 경우에만 미기재로 적는다
    /** @param array<string, mixed>|null $period */
    private function period(?array $period): string
    {
        return $period === null ? '미기재' : $period['from'] . ' ~ ' . $period['to'];
    }

    // 판정 이유에서 해당 규칙의 법정·자체 구분을 가져온다
    /** @param array<string, mixed> $report */
    private function ruleKind(?string $ruleId, array $report): string
    {
        foreach ($report['forecast']['judgment']['reasons'] ?? [] as $reason) {
            if ($reason['ruleId'] === $ruleId) {
                return $reason['kind'];
            }
        }
        return '구분 미기재';
    }
}
