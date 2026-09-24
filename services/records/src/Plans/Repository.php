<?php
// 계획 초안과 수정 전 원문을 SQLite 트랜잭션으로 보관한다
declare(strict_types=1);

namespace CrowdCast\Records\Plans;

use PDO;
use Throwable;

// 계획의 섹션 순서와 이전 본문을 원자적으로 보존한다
final class Repository
{
    public function __construct(private PDO $db)
    {
    }

    // 예보 ID의 불변 발행 문서를 원문 그대로 읽는다
    public function snapshot(string $forecastId): ?string
    {
        $query = $this->db->prepare('SELECT report_json FROM forecast_snapshots WHERE forecast_id = :id');
        $query->execute(['id' => $forecastId]);
        $value = $query->fetchColumn();
        return $value === false ? null : (string) $value;
    }

    // 헤더와 아홉 섹션을 계약의 순서로 재조립한다
    /** @return array<string, mixed>|null */
    public function find(string $id): ?array
    {
        $query = $this->db->prepare('SELECT * FROM plans WHERE id = :id');
        $query->execute(['id' => $id]);
        $row = $query->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }
        $sections = $this->db->prepare('SELECT * FROM plan_sections WHERE plan_id = :id ORDER BY position');
        $sections->execute(['id' => $id]);
        $plan = [
            'id' => $row['id'], 'forecastId' => $row['forecast_id'], 'eventId' => $row['event_id'],
            'sessionId' => $row['session_id'], 'title' => $row['title'], 'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'], 'watermark' => $row['watermark'], 'sections' => [],
        ];
        foreach ($sections->fetchAll(PDO::FETCH_ASSOC) as $section) {
            $plan['sections'][] = [
                'key' => $section['section_key'], 'title' => $section['title'], 'status' => $section['status'],
                'claimIds' => json_decode($section['claim_ids_json'], true, 512, JSON_THROW_ON_ERROR),
                'body' => $section['body'],
                'lockedFields' => json_decode($section['locked_fields_json'], true, 512, JSON_THROW_ON_ERROR),
            ];
        }
        return $plan;
    }

    // 새 초안의 헤더와 섹션은 모두 저장되거나 모두 취소된다
    /** @param array<string, mixed> $plan */
    public function insert(array $plan): void
    {
        $this->db->beginTransaction();
        try {
            $this->writeHeader($plan, false);
            $this->writeSections($plan);
            $this->db->commit();
        } catch (Throwable $error) {
            $this->db->rollBack();
            throw $error;
        }
    }

    // 수정 전 계획 전체를 먼저 기록한 뒤 최신 섹션을 교체한다
    /** @param array<string, mixed> $plan */
    public function update(array $plan): bool
    {
        $this->db->beginTransaction();
        try {
            $previous = $this->find($plan['id']);
            if ($previous === null) {
                $this->db->rollBack();
                return false;
            }
            $revision = $this->db->prepare(
                'INSERT INTO plan_revisions (plan_id, revision, previous_plan_json, revised_at) '
                . 'VALUES (:id, (SELECT COALESCE(MAX(revision), 0) + 1 FROM plan_revisions WHERE plan_id = :id2), :json, :at)'
            );
            $revision->execute([
                'id' => $plan['id'], 'id2' => $plan['id'],
                'json' => json_encode($previous, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                'at' => $plan['updatedAt'],
            ]);
            $this->writeHeader($plan, true);
            $delete = $this->db->prepare('DELETE FROM plan_sections WHERE plan_id = :id');
            $delete->execute(['id' => $plan['id']]);
            $this->writeSections($plan);
            $this->db->commit();
            return true;
        } catch (Throwable $error) {
            $this->db->rollBack();
            throw $error;
        }
    }

    // 생성 시각은 수정 때 유지하고 나머지 머리 필드를 최신 계약 값으로 저장한다
    /** @param array<string, mixed> $plan */
    private function writeHeader(array $plan, bool $update): void
    {
        $sql = $update
            ? 'UPDATE plans SET forecast_id=:forecast, event_id=:event, session_id=:session, title=:title, '
                . 'updated_at=:updated, watermark=:watermark WHERE id=:id'
            : 'INSERT INTO plans (id, forecast_id, event_id, session_id, title, created_at, updated_at, watermark) '
                . 'VALUES (:id, :forecast, :event, :session, :title, :created, :updated, :watermark)';
        $values = [
            'id' => $plan['id'], 'forecast' => $plan['forecastId'], 'event' => $plan['eventId'],
            'session' => $plan['sessionId'], 'title' => $plan['title'],
            'updated' => $plan['updatedAt'], 'watermark' => $plan['watermark'],
        ];
        if (!$update) {
            $values['created'] = $plan['createdAt'];
        }
        $this->db->prepare($sql)->execute($values);
    }

    // claimIds와 잠금 필드는 배열 JSON으로 보존한다
    /** @param array<string, mixed> $plan */
    private function writeSections(array $plan): void
    {
        $insert = $this->db->prepare(
            'INSERT INTO plan_sections (plan_id, section_key, position, title, status, claim_ids_json, body, locked_fields_json) '
            . 'VALUES (:plan, :key, :position, :title, :status, :claims, :body, :locked)'
        );
        foreach ($plan['sections'] as $position => $section) {
            $insert->execute([
                'plan' => $plan['id'], 'key' => $section['key'], 'position' => $position,
                'title' => $section['title'], 'status' => $section['status'],
                'claims' => json_encode($section['claimIds'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                'body' => $section['body'],
                'locked' => json_encode($section['lockedFields'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            ]);
        }
    }
}
