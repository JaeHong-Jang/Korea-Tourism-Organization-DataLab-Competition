<?php
// 예보 스냅샷의 계약과 행사 소속을 검증한다
declare(strict_types=1);

namespace CrowdCast\Records\Snapshots;

use CrowdCast\Records\Events\Repository as EventRepository;
use CrowdCast\Records\Support\ContractValidator;
use InvalidArgumentException;
use JsonException;
use RuntimeException;

// 발행 예보서 전체를 검증한 다음 원문 그대로 저장한다
final class Service
{
    private ReportIntegrity $integrity;

    // 요청과 저장본에 같은 계약 무결성 판정을 적용한다
    public function __construct(
        private Repository $repository,
        private EventRepository $events,
        private ContractValidator $validator
    ) {
        $this->integrity = new ReportIntegrity();
    }

    // 경로의 행사 ID와 발행 문서 내부의 행사 ID가 일치해야 한다
    public function validateRequest(string $eventId, string $json): object
    {
        $report = json_decode($json, false);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new InvalidArgumentException('invalid_forecast_report');
        }

        // 무한대 수치는 목록 응답의 JSON 직렬화를 막으므로 저장 전에 거부한다
        try {
            json_encode($report, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new InvalidArgumentException('invalid_forecast_report');
        }
        if (!$this->validator->isValid('forecast-report', $report)) {
            throw new InvalidArgumentException('invalid_forecast_report');
        }
        if (!$this->hasMatchingIds($report, $eventId) || $this->integrity->problems($report) !== []) {
            throw new InvalidArgumentException('event_id_mismatch');
        }
        return $report;
    }

    // DB에서 읽은 문서도 경로와 내부 참조가 일치하는지 다시 검사한다
    public function validateResponse(string $eventId, string $json): void
    {
        $report = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        try {
            json_encode($report, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new RuntimeException('저장된 예보서를 JSON으로 반환할 수 없습니다');
        }
        if (!$this->validator->isValid('forecast-report', $report)
            || !$this->hasMatchingIds($report, $eventId)
            || $this->integrity->problems($report) !== []) {
            throw new RuntimeException('저장된 예보서가 계약을 위반합니다');
        }
    }

    // 발행 예보서 머리와 모든 문장의 예보·세션 참조를 같은 발행 건으로 묶는다
    private function hasMatchingIds(object $report, string $eventId): bool
    {
        if (
            $report->forecast->id !== $report->forecastId
            || $report->card->id !== $report->forecastId
            || $report->forecast->eventId !== $eventId
            || $report->event->id !== $eventId
            || $report->card->eventId !== $eventId
        ) {
            return false;
        }
        foreach ($report->claims as $claim) {
            if ($claim->forecastId !== $report->forecastId || $claim->sessionId !== $report->sessionId) {
                return false;
            }
        }
        return true;
    }

    // 존재하는 행사에만 완전한 발행 예보서를 추가한다
    public function create(string $eventId, string $json): ?string
    {
        $report = $this->validateRequest($eventId, $json);
        if ($this->events->find($eventId) === null) {
            return null;
        }
        $this->repository->insert($report->forecastId, $eventId, $report->publishedAt, $json);
        $this->validateResponse($eventId, $json);
        return $json;
    }

    // 존재하는 행사의 발행 스냅샷만 계약 검사 후 돌려준다
    /** @return list<object>|null */
    public function all(string $eventId): ?array
    {
        if (!$this->events->existsIncludingDeleted($eventId)) {
            return null;
        }
        $result = [];
        foreach ($this->repository->all($eventId) as $json) {
            $this->validateResponse($eventId, $json);
            $result[] = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        }
        return $result;
    }
}
