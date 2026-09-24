<?php
// 행사 실측을 추가하고 입력 순서에 따른 최신본과 전체 이력을 읽는다
declare(strict_types=1);

namespace CrowdCast\Records\Actuals;

use PDO;

// 데이터베이스의 불변 트리거와 함께 실측의 추가 전용 접근을 제공한다
final class Repository
{
    public function __construct(private PDO $db)
    {
    }

    // 서버 시각과 원문 수치를 같은 행에 저장하고 부여된 순번을 반환한다
    public function append(string $eventId, string $actualJson, string $recordedAt): int
    {
        $statement = $this->db->prepare(
            'INSERT INTO actuals (event_id, actual_json, recorded_at) VALUES (:event_id, :actual_json, :recorded_at)'
        );
        $statement->execute([
            'event_id' => $eventId,
            'actual_json' => $actualJson,
            'recorded_at' => $recordedAt,
        ]);
        return (int) $this->db->lastInsertId();
    }

    // 채점과 행사 화면에서 쓸 기본 실측은 마지막 입력 행이다
    /** @return array{id: int, event_id: string, actual_json: string, recorded_at: string}|null */
    public function latest(string $eventId): ?array
    {
        $statement = $this->db->prepare(
            'SELECT id, event_id, actual_json, recorded_at FROM actuals WHERE event_id = :event_id ORDER BY id DESC LIMIT 1'
        );
        $statement->execute(['event_id' => $eventId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        return $row === false ? null : $row;
    }

    // 이전 실측도 재검토할 수 있게 입력 순서대로 모두 돌려준다
    /** @return list<array{id: int, event_id: string, actual_json: string, recorded_at: string}> */
    public function history(string $eventId): array
    {
        $statement = $this->db->prepare(
            'SELECT id, event_id, actual_json, recorded_at FROM actuals WHERE event_id = :event_id ORDER BY id'
        );
        $statement->execute(['event_id' => $eventId]);
        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }
}
