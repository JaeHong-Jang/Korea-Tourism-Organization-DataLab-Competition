<?php
// 행사 요청과 저장된 응답을 계약 스키마로 검사한다
declare(strict_types=1);

namespace CrowdCast\Records\Events;

use CrowdCast\Records\Support\ContractValidator;
use InvalidArgumentException;
use JsonException;
use RuntimeException;

// 행사 원문은 계약 검사 뒤에만 저장하거나 반환한다
final class Service
{
    public function __construct(private Repository $repository, private ContractValidator $validator)
    {
    }

    // POST 본문이 event 계약을 만족하는지 확인한다
    public function validateRequest(string $json): string
    {
        $event = json_decode($json, false);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new InvalidArgumentException('invalid_event');
        }

        // JSON 파서가 받아들인 무한대 수치는 목록 응답으로 재직렬화할 수 없어 거부한다
        try {
            json_encode($event, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new InvalidArgumentException('invalid_event');
        }
        if (!$this->validator->isValid('event', $event)) {
            throw new InvalidArgumentException('invalid_event');
        }
        return $event->id;
    }

    // 저장소에서 읽은 event도 송신 전에 계약을 검사한다
    public function validateResponse(string $json): void
    {
        $event = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        // 저장된 수치도 JSON 응답으로 안전하게 되돌릴 수 있어야 한다
        try {
            json_encode($event, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new RuntimeException('저장된 행사를 JSON으로 반환할 수 없습니다');
        }
        if (!$this->validator->isValid('event', $event)) {
            throw new RuntimeException('저장된 행사가 계약을 위반합니다');
        }
    }

    // 저장한 행사 원문을 응답에도 그대로 사용한다
    public function create(string $json): string
    {
        $id = $this->validateRequest($json);
        $this->repository->insert($id, $json);
        $this->validateResponse($json);
        return $json;
    }

    // 조회한 행사의 계약을 다시 검사한다
    public function get(string $id): ?string
    {
        $json = $this->repository->find($id);
        if ($json !== null) {
            $this->validateResponse($json);
        }
        return $json;
    }

    // 목록의 각 행사도 개별 계약을 통과시킨다
    /** @return list<object> */
    public function all(): array
    {
        $result = [];
        foreach ($this->repository->all() as $json) {
            $this->validateResponse($json);
            $result[] = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        }
        return $result;
    }

    // 삭제는 원문과 발행 스냅샷을 보존하는 논리 삭제다
    public function delete(string $id): bool
    {
        return $this->repository->delete($id);
    }
}
