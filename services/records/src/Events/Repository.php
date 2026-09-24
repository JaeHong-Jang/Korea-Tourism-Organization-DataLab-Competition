<?php
// 저장한 행사 원문과 삭제 상태를 SQLite에서 관리한다
declare(strict_types=1);

namespace CrowdCast\Records\Events;

use PDO;

// 발행 기록의 외래 키를 유지하며 행사를 논리적으로 삭제한다
final class Repository
{
    public function __construct(private PDO $db)
    {
    }

    // 활성 행사 원문을 생성 순서대로 돌려준다
    /** @return list<string> */
    public function all(): array
    {
        $rows = $this->db->query('SELECT event_json FROM events WHERE deleted_at IS NULL ORDER BY created_at, id')
            ->fetchAll(PDO::FETCH_COLUMN);
        return array_values($rows);
    }

    // 삭제된 행사와 없는 행사는 조회 결과에서 제외한다
    public function find(string $id): ?string
    {
        $statement = $this->db->prepare('SELECT event_json FROM events WHERE id = :id AND deleted_at IS NULL');
        $statement->execute(['id' => $id]);
        $value = $statement->fetchColumn();
        return $value === false ? null : $value;
    }

    // 삭제된 행사도 발행 스냅샷의 이력 조회에서는 존재하는 행사로 본다
    public function existsIncludingDeleted(string $id): bool
    {
        $statement = $this->db->prepare('SELECT 1 FROM events WHERE id = :id');
        $statement->execute(['id' => $id]);
        return $statement->fetchColumn() !== false;
    }

    // 이미 저장된 ID는 덮어쓰지 않고 최초 행사 원문을 보존한다
    public function insert(string $id, string $json): void
    {
        $statement = $this->db->prepare(
            'INSERT INTO events (id, event_json, created_at, updated_at) VALUES (:id, :json, :created, :updated)'
        );
        $now = gmdate('c');
        $statement->execute(['id' => $id, 'json' => $json, 'created' => $now, 'updated' => $now]);
    }

    // 불변 스냅샷을 참조 가능하게 둔 채 행사를 목록에서 숨긴다
    public function delete(string $id): bool
    {
        $statement = $this->db->prepare('UPDATE events SET deleted_at = :now WHERE id = :id AND deleted_at IS NULL');
        $statement->execute(['now' => gmdate('c'), 'id' => $id]);
        return $statement->rowCount() === 1;
    }
}
