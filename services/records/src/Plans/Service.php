<?php
// 계획 요청과 저장 응답을 계약 및 불변 발행 스냅샷에 맞춰 검증한다
declare(strict_types=1);

namespace CrowdCast\Records\Plans;

use CrowdCast\Records\Support\ContractValidator;
use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;
use RuntimeException;

// 서버 시각을 부여하고 본문 검사 뒤에만 저장소를 변경한다
final class Service
{
    private BodyInspector $inspector;

    // 저장소와 계약 검증기를 공유하고 본문 검사기를 준비한다
    public function __construct(private Repository $repository, private ContractValidator $validator)
    {
        $this->inspector = new BodyInspector();
    }

    // 생성 시각 입력값은 믿지 않고 KST 현재 시각으로 두 번 덮어쓴다
    /** @return array<string, mixed> */
    public function create(string $json): array
    {
        $plan = $this->parse($json);
        $this->validate($plan);
        $now = $this->now();
        $plan['createdAt'] = $now;
        $plan['updatedAt'] = $now;
        $this->assertContract($plan);
        $this->repository->insert($plan);
        return $this->checkedResponse($plan['id']);
    }

    // 기존 ID와 경로 ID가 같아야 하며 이전 문서는 이력에 남긴다
    /** @return array<string, mixed>|null */
    public function update(string $id, string $json): ?array
    {
        // 계약 검사 전에 저장본과 비교해 형식이 틀린 불변 필드도 이름으로 알린다
        $incoming = json_decode($json);
        if (!$incoming instanceof \stdClass || json_last_error() !== JSON_ERROR_NONE) {
            throw new InvalidArgumentException('plan: JSON 객체가 필요합니다');
        }
        $candidate = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        if (($candidate['id'] ?? null) !== $id) {
            throw new InvalidArgumentException('id: 경로와 본문 ID가 다릅니다');
        }
        $previous = $this->repository->find($id);
        if ($previous === null) {
            return null;
        }
        // 초안의 발행 값은 저장본과 비교하고 작성자 메모만 교체한다
        $this->assertNotesOnly($candidate, $previous);
        $plan = $this->parse($json);
        $expectedUpdatedAt = $plan['updatedAt'];
        $incomingSections = $plan['sections'];
        $plan = $previous;
        foreach ($plan['sections'] as $position => &$section) {
            if (array_key_exists('notes', $incomingSections[$position])) {
                $section['notes'] = $incomingSections[$position]['notes'];
            } else {
                unset($section['notes']);
            }
        }
        unset($section);
        $plan['updatedAt'] = $this->now();
        $this->assertContract($plan);
        $this->repository->update($plan, $expectedUpdatedAt);
        return $this->checkedResponse($id);
    }

    // 수정 가능한 notes를 제외한 첫 차이 필드를 422 메시지로 알려 준다
    /**
     * @param array<string, mixed> $incoming
     * @param array<string, mixed> $stored
     */
    private function assertNotesOnly(array $incoming, array $stored): void
    {
        foreach (['forecastId', 'eventId', 'sessionId', 'title', 'createdAt', 'watermark'] as $field) {
            if (($incoming[$field] ?? null) !== $stored[$field]) {
                throw new InvalidArgumentException("{$field}: 저장본과 다릅니다");
            }
        }
        if (!is_array($incoming['sections'] ?? null)
            || count($incoming['sections']) !== count($stored['sections'])) {
            throw new InvalidArgumentException('sections: 저장본과 다릅니다');
        }
        foreach ($stored['sections'] as $position => $section) {
            foreach (['key', 'title', 'status', 'claimIds', 'body', 'lockedFields'] as $field) {
                if (!is_array($incoming['sections'][$position] ?? null)
                    || !array_key_exists($field, $incoming['sections'][$position])
                    || $incoming['sections'][$position][$field] !== $section[$field]) {
                    throw new InvalidArgumentException("섹션 {$section['key']}.{$field}: 저장본과 다릅니다");
                }
            }
        }
    }

    // 조회 전에 저장된 초안도 계약 형태인지 다시 확인한다
    /** @return array<string, mixed>|null */
    public function get(string $id): ?array
    {
        $plan = $this->repository->find($id);
        if ($plan !== null) {
            $this->assertContract($plan, true);
        }
        return $plan;
    }

    // 내보내기는 저장본과 연결된 불변 스냅샷을 함께 가져온다
    /** @return array{0: array<string, mixed>, 1: array<string, mixed>}|null */
    public function document(string $id): ?array
    {
        $plan = $this->get($id);
        if ($plan === null) {
            return null;
        }
        $json = $this->repository->snapshot($plan['forecastId']);
        if ($json === null) {
            throw new RuntimeException('초안의 발행 스냅샷이 없습니다');
        }
        return [$plan, json_decode($json, true, 512, JSON_THROW_ON_ERROR)];
    }

    // 형식 오류도 섹션 위치를 담은 422 메시지로 반환할 수 있게 검사한다
    /** @return array<string, mixed> */
    private function parse(string $json): array
    {
        $object = json_decode($json);
        if (!$object instanceof \stdClass || json_last_error() !== JSON_ERROR_NONE) {
            throw new InvalidArgumentException('plan: JSON 객체가 필요합니다');
        }
        if (isset($object->sections) && is_array($object->sections)) {
            foreach ($object->sections as $position => $section) {
                if (!$this->validator->isValid('plan-section', $section)) {
                    $key = $section instanceof \stdClass && is_string($section->key ?? null)
                        ? $section->key : "위치 {$position}";
                    throw new InvalidArgumentException("섹션 {$key}: 계약 스키마 위반");
                }
            }
        }
        if (!$this->validator->isValid('plan', $object)) {
            throw new InvalidArgumentException('plan: 계약 스키마 위반');
        }
        return json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    }

    // 스냅샷 소속과 섹션 규칙을 먼저 검사하고 스키마로 나머지 필드를 확인한다
    /** @param array<string, mixed> $plan */
    private function validate(array $plan): void
    {
        $forecastId = $plan['forecastId'] ?? null;
        $json = is_string($forecastId) ? $this->repository->snapshot($forecastId) : null;
        if ($json === null) {
            throw new InvalidArgumentException('forecastId: 발행 스냅샷이 없습니다');
        }
        $report = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        if (($plan['eventId'] ?? null) !== $report['event']['id']
            || ($plan['sessionId'] ?? null) !== $report['sessionId']) {
            throw new InvalidArgumentException('eventId/sessionId: 발행 스냅샷과 다릅니다');
        }
        $this->inspector->inspect($plan, $report);
        foreach ($plan['sections'] as $section) {
            if (!$this->validator->isValid('plan-section', $this->object($section))) {
                throw new InvalidArgumentException('섹션 ' . $section['key'] . ': 계약 스키마 위반');
            }
        }
        $this->assertContract($plan);
    }

    // Opis의 객체 스키마 검사에는 JSON 객체로 변환한 값을 넘긴다
    /** @param array<string, mixed> $plan */
    private function assertContract(array $plan, bool $stored = false): void
    {
        if (!$this->validator->isValid('plan', $this->object($plan))) {
            if ($stored) {
                throw new RuntimeException('저장된 초안이 계약을 위반합니다');
            }
            throw new InvalidArgumentException('plan: 계약 스키마 위반');
        }
    }

    // 배열을 JSON으로 왕복시켜 객체·배열의 계약 차이를 보존한다
    private function object(mixed $value): mixed
    {
        return json_decode(json_encode($value, JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR);
    }

    // 생성 직후에도 DB 재조립 결과의 계약을 확인한다
    /** @return array<string, mixed> */
    private function checkedResponse(string $id): array
    {
        return $this->get($id) ?? throw new RuntimeException('저장된 초안을 찾을 수 없습니다');
    }

    // KST 오프셋을 포함하고 같은 초의 연속 수정도 구별한다
    private function now(): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone('Asia/Seoul')))->format('Y-m-d\TH:i:s.uP');
    }
}
