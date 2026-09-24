<?php
// 사전 등록 원장 행을 SQLite에서 원자적으로 추가하고 순번대로 읽는다
declare(strict_types=1);

namespace CrowdCast\Records\Ledger;

use PDO;
use Throwable;

// 쓰기 잠금을 먼저 잡아 연속 순번과 이전 해시를 같은 트랜잭션에서 결정한다
final class Repository
{
    // 모든 원장 작업이 같은 SQLite 연결과 쓰기 잠금을 사용한다
    public function __construct(private PDO $db)
    {
    }

    // 마지막 행을 읽고 해시를 만든 뒤 하나의 INSERT로 저장한다
    public function append(object $request, string $registeredAt): object
    {
        $this->db->exec('BEGIN IMMEDIATE');
        try {
            $last = $this->db->query('SELECT seq, hash FROM ledger_entries ORDER BY seq DESC LIMIT 1')->fetch();
            $entry = (object) [
                'seq' => $last === false ? 1 : (int) $last['seq'] + 1,
                'forecastId' => $request->forecastId,
                'eventId' => $request->eventId,
                'registeredAt' => $registeredAt,
                'leadDays' => $request->leadDays,
                'forecast' => $request->forecast,
                'prevHash' => $last === false ? Hash::GENESIS : $last['hash'],
            ];
            $pair = Hash::pair($entry, $entry->prevHash);
            $entry->payloadHash = $pair['payloadHash'];
            $entry->hash = $pair['hash'];

            // 원문 예보는 정수형을 유지한 JSON으로 보존한다
            $statement = $this->db->prepare(
                'INSERT INTO ledger_entries (seq, forecast_id, event_id, registered_at, lead_days, '
                . 'forecast_json, payload_hash, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $statement->execute([
                $entry->seq,
                $entry->forecastId,
                $entry->eventId,
                $entry->registeredAt,
                $entry->leadDays,
                json_encode($entry->forecast, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
                $entry->payloadHash,
                $entry->prevHash,
                $entry->hash,
            ]);
            $this->db->commit();
            return $entry;
        } catch (Throwable $error) {
            $this->db->rollBack();
            throw $error;
        }
    }

    // 검증과 공개 조회가 동일한 저장 행 전체를 순번대로 사용한다
    /** @return list<array<string, mixed>> */
    public function allRows(): array
    {
        return $this->db->query(
            'SELECT *, typeof(seq) AS seq_type, typeof(lead_days) AS lead_days_type '
            . 'FROM ledger_entries ORDER BY seq'
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    // 저장 열 이름을 계약의 필드 이름으로 옮겨 재검증한다
    /** @param array<string, mixed> $row */
    public static function entry(array $row): object
    {
        return (object) [
            'seq' => $row['seq'],
            'forecastId' => $row['forecast_id'],
            'eventId' => $row['event_id'],
            'registeredAt' => $row['registered_at'],
            'leadDays' => $row['lead_days'],
            'forecast' => json_decode($row['forecast_json'], false, 512, JSON_THROW_ON_ERROR),
            'payloadHash' => $row['payload_hash'],
            'prevHash' => $row['prev_hash'],
            'hash' => $row['hash'],
        ];
    }
}
