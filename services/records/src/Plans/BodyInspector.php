<?php
// 계획 섹션의 순서·발행 문장·잠금 수치 참조를 스냅샷과 대조한다
declare(strict_types=1);

namespace CrowdCast\Records\Plans;

use InvalidArgumentException;

// 계획 본문에 발행 예보서 밖의 문장과 수치가 섞이지 않게 한다
final class BodyInspector
{
    // 계약 enum의 순서가 바뀌면 검증도 같은 순서로 적용한다
    /** @return list<string> */
    private function keys(): array
    {
        $path = dirname(__DIR__, 4) . '/packages/contracts/schemas/plan-section.schema.json';
        $schema = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        return $schema['properties']['key']['enum'];
    }

    // 섹션 위치와 원문 연결을 하나씩 검사해 실패한 규칙을 알려 준다
    /**
     * @param array<string, mixed> $plan
     * @param array<string, mixed> $report
     */
    public function inspect(array $plan, array $report): void
    {
        $expectedKeys = $this->keys();
        if (
            !isset($plan['sections']) || !is_array($plan['sections'])
            || !array_is_list($plan['sections']) || count($plan['sections']) !== count($expectedKeys)
        ) {
            throw new InvalidArgumentException('sections: 계약 enum의 9개 섹션이 필요합니다');
        }
        $claims = [];
        foreach ($report['claims'] as $claim) {
            $claims[$claim['id']] = $claim;
        }
        $quantities = $this->collectQuantities($report);

        // 각 위치에서 키가 정확히 일치해야 누락·중복·재배열을 모두 거부한다
        foreach ($plan['sections'] as $position => $section) {
            $key = is_array($section) && is_string($section['key'] ?? null) ? $section['key'] : "위치 {$position}";
            if ($key !== $expectedKeys[$position]) {
                throw new InvalidArgumentException("섹션 {$key}: 위치 {$position}에는 {$expectedKeys[$position]} 키가 필요합니다");
            }
            if (!is_array($section)) {
                throw new InvalidArgumentException("섹션 {$key}: 계약 형식이 아닙니다");
            }
            $this->inspectSection($key, $section, $claims, $quantities, $report);
        }
    }

    // 발행 문장만 순서대로 연결하고 수치 참조가 실제 노드인지 확인한다
    /**
     * @param array<string, mixed> $section
     * @param array<string, array<string, mixed>> $claims
     * @param array<string, array<string, mixed>> $quantities
     * @param array<string, mixed> $report
     */
    private function inspectSection(string $key, array $section, array $claims, array $quantities, array $report): void
    {
        $claimIds = $section['claimIds'] ?? null;
        if (!is_array($claimIds)) {
            throw new InvalidArgumentException("섹션 {$key}: claimIds 배열이 필요합니다");
        }
        if (($section['status'] ?? null) === '작성됨' && $claimIds === []) {
            throw new InvalidArgumentException("섹션 {$key}: 작성됨에는 claimIds가 필요합니다");
        }
        $rendered = [];
        foreach ($claimIds as $claimId) {
            $claim = is_string($claimId) ? ($claims[$claimId] ?? null) : null;
            if (
                $claim === null || $claim['status'] !== 'published'
                || $claim['sessionId'] !== $report['sessionId'] || $claim['forecastId'] !== $report['forecastId']
            ) {
                throw new InvalidArgumentException("섹션 {$key}: claimIds에 이 스냅샷의 발행 문장만 넣을 수 있습니다");
            }
            $rendered[] = $claim['rendered'];
        }
        if (!is_string($section['body'] ?? null) || $section['body'] !== implode("\n", $rendered)) {
            throw new InvalidArgumentException("섹션 {$key}: body는 claimIds의 rendered를 줄바꿈으로 이은 원문이어야 합니다");
        }
        if (!is_array($section['lockedFields'] ?? null)) {
            throw new InvalidArgumentException("섹션 {$key}: lockedFields 배열이 필요합니다");
        }
        foreach ($section['lockedFields'] as $field) {
            if (
                !is_array($field) || !is_string($field['quantityId'] ?? null)
                || !isset($quantities[$field['quantityId']])
            ) {
                throw new InvalidArgumentException("섹션 {$key}: lockedFields.quantityId가 스냅샷에 없습니다");
            }
            $quantity = $quantities[$field['quantityId']];
            $name = $field['name'] ?? null;
            $number = is_string($name) ? ($quantity[$name] ?? null) : null;
            if (
                !in_array($name, ['p10', 'p50', 'p90', 'value'], true)
                || (!is_int($number) && !is_float($number))
            ) {
                throw new InvalidArgumentException("섹션 {$key}: lockedFields.name은 해당 수치의 실제 칸이어야 합니다");
            }
            $expected = json_encode($number, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION) . ' ' . $quantity['unit'];
            if (($field['value'] ?? null) !== $expected) {
                throw new InvalidArgumentException("섹션 {$key}: lockedFields.value는 스냅샷 수치 {$expected}와 같아야 합니다");
            }
        }
    }

    // 수치 객체 전체를 모아 잠금 칸의 값과 단위까지 확인한다
    /** @return array<string, array<string, mixed>> */
    private function collectQuantities(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }
        $found = [];
        if (isset($value['id'], $value['unit']) && is_string($value['id']) && str_starts_with($value['id'], 'q-')) {
            $found[$value['id']] = $value;
        }
        foreach ($value as $child) {
            if (is_array($child)) {
                $found += $this->collectQuantities($child);
            }
        }
        return $found;
    }
}
