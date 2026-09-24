<?php
// 메모리 SQLite에 기본 스키마를 적용하고 스냅샷 불변성을 검사한다
declare(strict_types=1);

namespace CrowdCast\Records\Tests;

use CrowdCast\Records\Support\Db;
use CrowdCast\Records\Support\Migrator;
use PDOException;
use PHPUnit\Framework\TestCase;

// 발행 예보서가 모든 SQL 변경 경로에서 불변인지 확인한다
final class MigrationTest extends TestCase
{
    // 마이그레이션은 재실행 가능하며 저장된 예보서의 UPDATE를 거부한다
    public function testSnapshotCannotBeUpdated(): void
    {
        $db = Db::connect('sqlite::memory:');
        Migrator::run($db);
        Migrator::run($db);
        self::assertSame(6, (int) $db->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn());

        // 계약 픽스처를 원문 JSON으로 저장해 스냅샷 열의 용도를 확인한다
        $event = (string) file_get_contents(dirname(__DIR__, 3) . '/packages/contracts/fixtures/event/valid-yeongjong.json');
        $report = (string) file_get_contents(dirname(__DIR__, 3) . '/packages/contracts/fixtures/forecast-report/valid-yeongjong.json');
        $db->prepare('INSERT INTO events (id, event_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
            ->execute(['e-yeongjong-fireworks-2025', $event, '2025-10-04', '2025-10-04']);
        $db->prepare('INSERT INTO forecast_snapshots (forecast_id, event_id, published_at, report_json) VALUES (?, ?, ?, ?)')
            ->execute(['f-yeongjong-2025', 'e-yeongjong-fireworks-2025', '2026-09-24T20:00:15+09:00', $report]);
        self::assertSame($report, $db->query('SELECT report_json FROM forecast_snapshots')->fetchColumn());

        // 트리거가 원문을 바꾸는 명령을 거부해야 한다
        $this->expectException(PDOException::class);
        $this->expectExceptionMessage('forecast snapshot is immutable');
        $db->exec("UPDATE forecast_snapshots SET report_json = '{}' WHERE forecast_id = 'f-yeongjong-2025'");
    }

    // 스냅샷의 DELETE도 데이터베이스 단계에서 거부한다
    public function testSnapshotCannotBeDeleted(): void
    {
        $db = Db::connect('sqlite::memory:');
        Migrator::run($db);
        $db->exec("INSERT INTO events (id, event_json, created_at, updated_at) VALUES ('e-yeongjong-fireworks-2025', '{}', '2025-10-04', '2025-10-04')");
        $db->exec("INSERT INTO forecast_snapshots VALUES ('f-yeongjong-2025', 'e-yeongjong-fireworks-2025', '2026-09-24', '{}')");

        // 삭제 시도도 스냅샷 원문에 영향을 줄 수 없어야 한다
        $this->expectException(PDOException::class);
        $this->expectExceptionMessage('forecast snapshot is immutable');
        $db->exec("DELETE FROM forecast_snapshots WHERE forecast_id = 'f-yeongjong-2025'");
    }

    // 충돌 처리와 직접 변경 명령이 모두 발행 스냅샷을 보존하는지 확인한다
    public function testSnapshotIsImmutableAcrossWriteStatements(): void
    {
        $db = Db::connect('sqlite::memory:');
        self::assertSame(1, (int) $db->query('PRAGMA recursive_triggers')->fetchColumn());
        Migrator::run($db);
        $db->exec("INSERT INTO events (id, event_json, created_at, updated_at) VALUES ('e-yeongjong-fireworks-2025', '{}', '2025-10-04', '2025-10-04')");
        $db->exec("INSERT INTO forecast_snapshots VALUES ('f-yeongjong-2025', 'e-yeongjong-fireworks-2025', '2026-09-24', '{\"original\":true}')");

        // rowid 충돌까지 포함해 변경 전 행 전체를 비교 기준으로 남긴다
        $original = $db->query('SELECT rowid, * FROM forecast_snapshots')->fetch();
        self::assertIsArray($original);
        $rowid = (int) $original['rowid'];

        // 각 SQL 경로가 트리거를 우회해 기존 행을 바꾸거나 지우는지 검사한다
        $statements = [
            'INSERT OR REPLACE' => "INSERT OR REPLACE INTO forecast_snapshots VALUES ('f-yeongjong-2025', 'e-yeongjong-fireworks-2025', '2026-09-25', '{\"changed\":true}')",
            'REPLACE INTO' => "REPLACE INTO forecast_snapshots VALUES ('f-yeongjong-2025', 'e-yeongjong-fireworks-2025', '2026-09-25', '{\"changed\":true}')",
            'ON CONFLICT DO UPDATE' => "INSERT INTO forecast_snapshots VALUES ('f-yeongjong-2025', 'e-yeongjong-fireworks-2025', '2026-09-25', '{\"changed\":true}') ON CONFLICT(forecast_id) DO UPDATE SET report_json = excluded.report_json",
            'INSERT OR IGNORE' => "INSERT OR IGNORE INTO forecast_snapshots VALUES ('f-yeongjong-2025', 'e-yeongjong-fireworks-2025', '2026-09-25', '{\"changed\":true}')",
            'rowid INSERT OR REPLACE' => "INSERT OR REPLACE INTO forecast_snapshots (rowid, forecast_id, event_id, published_at, report_json) VALUES ({$rowid}, 'f-yeongjong-revised-2025', 'e-yeongjong-fireworks-2025', '2026-09-25', '{\"changed\":true}')",
            'UPDATE' => "UPDATE forecast_snapshots SET report_json = '{\"changed\":true}' WHERE forecast_id = 'f-yeongjong-2025'",
            'DELETE' => "DELETE FROM forecast_snapshots WHERE forecast_id = 'f-yeongjong-2025'",
        ];
        foreach ($statements as $name => $statement) {
            $rejected = false;
            try {
                $db->exec($statement);
            } catch (PDOException $error) {
                $rejected = true;
                self::assertStringContainsString('forecast snapshot is immutable', $error->getMessage());
            }

            // IGNORE는 무시도 허용하고 나머지 변경 시도는 명시적 거부를 요구한다
            if ($name !== 'INSERT OR IGNORE') {
                self::assertTrue($rejected, "스냅샷 변경이 거부되지 않음: {$name}");
            }
            self::assertSame($original, $db->query('SELECT rowid, * FROM forecast_snapshots')->fetch());
            self::assertSame(1, (int) $db->query('SELECT COUNT(*) FROM forecast_snapshots')->fetchColumn());
        }
    }

    // 005까지만 설치된 운영 DB에 006을 적용해 기존 이력도 변경 불가로 만든다
    public function testRevisionGuardsInstallOnDatabaseAlreadyAt005(): void
    {
        $db = Db::connect('sqlite::memory:');
        $db->exec('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
        $directory = dirname(__DIR__) . '/migrations';
        foreach (glob($directory . '/00[1-5]_*.sql') ?: [] as $file) {
            $db->exec((string) file_get_contents($file));
            $db->prepare('INSERT INTO schema_migrations VALUES (?, ?)')->execute([basename($file), '2026-09-24']);
        }
        self::assertSame(5, (int) $db->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn());
        self::assertSame(0, (int) $db->query("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'plan_revisions_no_%'")->fetchColumn());

        // 006 적용 전에 만든 이력도 보호 대상이어야 한다
        $db->exec("INSERT INTO events (id, event_json, created_at, updated_at) VALUES ('e-yeongjong-fireworks-2025', '{}', '2025-10-04', '2025-10-04')");
        $db->exec("INSERT INTO forecast_snapshots VALUES ('f-yeongjong-2025', 'e-yeongjong-fireworks-2025', '2026-09-24', '{}')");
        $db->exec("INSERT INTO plans VALUES ('plan-yeongjong-example', 'f-yeongjong-2025', 'e-yeongjong-fireworks-2025', 's-demo-0001', '영종 안전관리계획', '2026-09-24', '2026-09-24', '참고용 초안 — 담당자 검토 필수')");
        $db->exec("INSERT INTO plan_revisions VALUES ('plan-yeongjong-example', 1, '{}', '2026-09-24')");
        $original = $db->query('SELECT rowid, * FROM plan_revisions')->fetch();
        self::assertIsArray($original);
        Migrator::run($db);
        Migrator::run($db);
        self::assertSame(6, (int) $db->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn());
        self::assertSame(3, (int) $db->query("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'plan_revisions_no_%'")->fetchColumn());

        // 재실행 후에도 세 종류의 변경 SQL이 이전 본문을 손상시키지 않아야 한다
        foreach ([
            "UPDATE plan_revisions SET previous_plan_json = '{\"changed\":true}' WHERE revision = 1",
            "DELETE FROM plan_revisions WHERE revision = 1",
            "REPLACE INTO plan_revisions VALUES ('plan-yeongjong-example', 1, '{}', '2026-09-25')",
        ] as $sql) {
            try {
                $db->exec($sql);
                self::fail('기존 이력 변경이 허용됨');
            } catch (PDOException $error) {
                self::assertStringContainsString('plan revision is immutable', $error->getMessage());
            }
            self::assertSame($original, $db->query('SELECT rowid, * FROM plan_revisions')->fetch());
        }
    }
}
