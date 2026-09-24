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
        $plan = $this->parse($json);
        if ($plan['id'] !== $id) {
            throw new InvalidArgumentException('id: 경로와 본문 ID가 다릅니다');
        }
        $this->validate($plan);
        $previous = $this->repository->find($id);
        if ($previous === null) {
            return null;
        }
        $plan['createdAt'] = $previous['createdAt'];
        $plan['updatedAt'] = $this->now();
        $this->assertContract($plan);
        $this->repository->update($plan);
        return $this->checkedResponse($id);
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
        $plan = json_decode($json, true);
        if (!is_array($plan) || json_last_error() !== JSON_ERROR_NONE) {
            throw new InvalidArgumentException('plan: JSON 객체가 필요합니다');
        }
        return $plan;
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
