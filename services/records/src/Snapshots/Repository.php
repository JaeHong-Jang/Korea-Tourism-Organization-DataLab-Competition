<?php
// 발행된 예보서 전체 원문을 행사별로 추가하고 조회한다
declare(strict_types=1);

namespace CrowdCast\Records\Snapshots;

use DateTimeImmutable;
use PDO;

// 스냅샷은 INSERT와 SELECT만 제공해 수정 경로를 만들지 않는다
final class Repository
{
    public function __construct(private PDO $db)
    {
    }

    // 발행 시각을 실제 순간으로 비교해 서로 다른 시간대도 올바르게 정렬한다
    /** @return list<string> */
    public function all(string $eventId): array
    {
        $statement = $this->db->prepare(
            'SELECT forecast_id, published_at, report_json FROM forecast_snapshots WHERE event_id = :event_id'
        );
        $statement->execute(['event_id' => $eventId]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
        usort($rows, static function (array $left, array $right): int {
            $order = (new DateTimeImmutable($left['published_at'])) <=> (new DateTimeImmutable($right['published_at']));
            return $order !== 0 ? $order : strcmp($left['forecast_id'], $right['forecast_id']);
        });
        return array_map(static fn(array $row): string => $row['report_json'], $rows);
    }

    // 예보 ID가 중복되면 데이터베이스 불변 트리거가 원문 변경을 거부한다
    public function insert(string $forecastId, string $eventId, string $publishedAt, string $json): void
    {
        $statement = $this->db->prepare(
            'INSERT INTO forecast_snapshots (forecast_id, event_id, published_at, report_json) '
            . 'VALUES (:forecast_id, :event_id, :published_at, :report_json)'
        );
        $statement->execute([
            'forecast_id' => $forecastId,
            'event_id' => $eventId,
            'published_at' => $publishedAt,
            'report_json' => $json,
        ]);
    }
}
