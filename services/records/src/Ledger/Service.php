<?php
// 사전 등록 요청과 저장본의 계약 및 해시 체인 무결성을 확인한다
declare(strict_types=1);

namespace CrowdCast\Records\Ledger;

use CrowdCast\Records\Events\Repository as EventRepository;
use CrowdCast\Records\Support\ContractValidator;
use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;
use JsonException;
use RuntimeException;
use stdClass;

// 계약을 통과한 예보만 추가하고 저장된 전 체인을 처음부터 검증한다
final class Service
{
    // 원장·행사 저장소와 계약 검증기를 함께 사용한다
    public function __construct(
        private Repository $repository,
        private EventRepository $events,
        private ContractValidator $validator
    ) {
    }

    // 요청에는 서버가 붙이는 순번·시각·해시를 받지 않는다
    public function validateRequest(string $json): object
    {
        try {
            $request = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
            if (!$request instanceof stdClass || !$this->keysAre($request, ['forecastId', 'eventId', 'leadDays', 'forecast'])) {
                throw new InvalidArgumentException('invalid_ledger_entry');
            }
            if (!$request->forecast instanceof stdClass || !$this->keysAre(
                $request->forecast,
                ['dailyMeanP10', 'dailyMeanP50', 'dailyMeanP90', 'level']
            )) {
                throw new InvalidArgumentException('invalid_ledger_entry');
            }
            if (!is_int($request->leadDays) || !is_int($request->forecast->dailyMeanP10)
                || !is_int($request->forecast->dailyMeanP50) || !is_int($request->forecast->dailyMeanP90)
                || !is_int($request->forecast->level)) {
                throw new InvalidArgumentException('invalid_ledger_entry');
            }

            // 공개 항목의 정본 스키마를 요청의 필드·값 검증에도 사용한다
            $candidate = (object) [
                'seq' => 1,
                'forecastId' => $request->forecastId,
                'eventId' => $request->eventId,
                'registeredAt' => '2026-09-29T00:00:00+09:00',
                'leadDays' => $request->leadDays,
                'forecast' => $request->forecast,
                'payloadHash' => Hash::GENESIS,
                'prevHash' => Hash::GENESIS,
                'hash' => Hash::GENESIS,
            ];
            if (!$this->validator->isValid('ledger-entry', $candidate)) {
                throw new InvalidArgumentException('invalid_ledger_entry');
            }
            return $request;
        } catch (JsonException) {
            throw new InvalidArgumentException('invalid_ledger_entry');
        }
    }

    // 정확히 필요한 요청 키만 허용해 해시에서 빠진 입력이 남지 않게 한다
    /** @param list<string> $expected */
    private function keysAre(stdClass $value, array $expected): bool
    {
        $keys = array_keys(get_object_vars($value));
        sort($keys, SORT_STRING);
        sort($expected, SORT_STRING);
        return $keys === $expected;
    }

    // 삭제 표시된 행사도 보존된 이력으로 인정하고 서버 KST 시각을 기록한다
    public function create(string $json): ?object
    {
        $request = $this->validateRequest($json);
        if (!$this->events->existsIncludingDeleted($request->eventId)) {
            return null;
        }
        $registeredAt = (new DateTimeImmutable('now', new DateTimeZone('Asia/Seoul')))->format('Y-m-d\TH:i:sP');
        $entry = $this->repository->append($request, $registeredAt);
        $this->validateResponse($entry);
        return $entry;
    }

    // 읽기 응답도 원장 계약을 통과해야 공개한다
    private function validateResponse(object $entry): void
    {
        if (!$this->validator->isValid('ledger-entry', $entry)) {
            throw new RuntimeException('저장된 원장이 계약을 위반합니다');
        }
    }

    // 저장된 항목을 순번대로 내보내기 전에 계약을 재검사한다
    /** @return list<object> */
    public function all(): array
    {
        $entries = [];
        foreach ($this->repository->allRows() as $row) {
            $entry = Repository::entry($row);
            $this->validateResponse($entry);
            $entries[] = $entry;
        }
        return $entries;
    }

    // 행마다 연속 순번·이전 해시·본문 해시·최종 해시를 원장 처음부터 비교한다
    /** @return array{valid: bool, count: int, brokenAt: int|null} */
    public function verify(): array
    {
        $rows = $this->repository->allRows();
        $previous = Hash::GENESIS;
        $expectedSeq = 1;
        foreach ($rows as $row) {
            // SQLite의 실제 저장 타입을 먼저 확인해 강제 변환으로 숨겨지는 변조를 막는다
            if ($row['seq_type'] !== 'integer' || !is_int($row['seq'])) {
                return ['valid' => false, 'count' => count($rows), 'brokenAt' => $expectedSeq];
            }
            $seq = $row['seq'];
            if ($row['lead_days_type'] !== 'integer' || !is_int($row['lead_days'])) {
                return ['valid' => false, 'count' => count($rows), 'brokenAt' => $seq];
            }
            try {
                $entry = Repository::entry($row);
                if ($seq !== $expectedSeq || !$this->validator->isValid('ledger-entry', $entry)
                    || !$entry->forecast instanceof stdClass
                    || !is_int($entry->forecast->dailyMeanP10)
                    || !is_int($entry->forecast->dailyMeanP50)
                    || !is_int($entry->forecast->dailyMeanP90)
                    || !is_int($entry->forecast->level)) {
                    return ['valid' => false, 'count' => count($rows), 'brokenAt' => $seq];
                }

                // 유효한 원문 값으로만 정본 JSON을 만든 뒤 저장된 체인과 비교한다
                $pair = Hash::pair($entry, $previous);
                if (!hash_equals($previous, $entry->prevHash)
                    || !hash_equals($pair['payloadHash'], $entry->payloadHash)
                    || !hash_equals($pair['hash'], $entry->hash)) {
                    return ['valid' => false, 'count' => count($rows), 'brokenAt' => $seq];
                }
            } catch (JsonException) {
                return ['valid' => false, 'count' => count($rows), 'brokenAt' => $seq];
            }
            $previous = $entry->hash;
            $expectedSeq++;
        }
        return ['valid' => true, 'count' => count($rows), 'brokenAt' => null];
    }
}
