<?php
// 행사 실측의 계약과 관측 의미를 검사한 뒤 입력 이력에 추가한다
declare(strict_types=1);

namespace CrowdCast\Records\Actuals;

use CrowdCast\Records\Events\Repository as EventRepository;
use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;
use JsonException;
use RuntimeException;
use stdClass;

// 예측값을 실측으로 저장하지 않고 응답에도 원문 수치를 보존한다
final class Service
{
    public function __construct(
        private Repository $repository,
        private EventRepository $events,
        private QuantityValidator $validator
    ) {
    }

    // 요청은 행사 ID와 계약 수치만 받고 서버 시각은 직접 만든다
    public function validateRequest(string $json): stdClass
    {
        try {
            $request = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
            json_encode($request, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new InvalidArgumentException('invalid_actual');
        }
        if (!$request instanceof stdClass || array_keys(get_object_vars($request)) === []) {
            throw new InvalidArgumentException('invalid_actual');
        }
        $keys = array_keys(get_object_vars($request));
        sort($keys, SORT_STRING);
        if (
            $keys !== ['actual', 'eventId']
            || !is_string($request->eventId)
            || preg_match('/^e-[a-z0-9][a-z0-9_.:-]{1,120}$/D', $request->eventId) !== 1
            || !$request->actual instanceof stdClass
            || !$this->validator->isValid($request->actual)
            || !in_array($request->actual->valueKind, ['관측', '사후집계'], true)
            || $request->actual->estimated !== false
            || $request->actual->value === null
        ) {
            throw new InvalidArgumentException('invalid_actual');
        }
        return $request;
    }

    // 기록 시점은 서버 KST 시각이며 행사 소속은 삭제 표시를 포함해 확인한다
    public function create(string $json): stdClass
    {
        $request = $this->validateRequest($json);
        if (!$this->events->existsIncludingDeleted($request->eventId)) {
            throw new InvalidArgumentException('unknown_event');
        }
        $recordedAt = (new DateTimeImmutable('now', new DateTimeZone('Asia/Seoul')))->format('Y-m-d\TH:i:sP');
        $actualJson = json_encode($request->actual, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION);
        $id = $this->repository->append($request->eventId, $actualJson, $recordedAt);
        $stored = (object) [
            'id' => $id,
            'eventId' => $request->eventId,
            'actual' => json_decode($actualJson, false, 512, JSON_THROW_ON_ERROR),
            'recordedAt' => $recordedAt,
        ];
        if (!$this->validator->isValid($stored->actual)) {
            throw new RuntimeException('저장된 실측이 계약을 위반합니다');
        }
        return $stored;
    }
}
