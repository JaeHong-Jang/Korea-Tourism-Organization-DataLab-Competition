<?php
// 번호순 SQL 파일을 한 번씩 적용하고 적용 내역을 기록한다
declare(strict_types=1);

namespace CrowdCast\Records\Support;

use PDO;
use RuntimeException;
use Throwable;

// SQL 마이그레이션을 파일 이름순으로 한 번씩 적용한다
final class Migrator
{
    // 같은 데이터베이스에서 재실행해도 이미 적용한 파일은 건너뛴다
    public static function run(PDO $db, ?string $directory = null): void
    {
        $directory ??= dirname(__DIR__, 2) . '/migrations';
        $files = glob($directory . '/*.sql');
        if ($files === false) {
            throw new RuntimeException('마이그레이션 목록을 읽을 수 없습니다');
        }
        sort($files, SORT_STRING);
        $db->exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');

        // 파일마다 원자적으로 적용해 실패한 파일을 완료로 기록하지 않는다
        foreach ($files as $file) {
            $name = basename($file);
            $check = $db->prepare('SELECT 1 FROM schema_migrations WHERE name = :name');
            $check->execute(['name' => $name]);
            if ($check->fetchColumn() !== false) {
                continue;
            }
            $sql = file_get_contents($file);
            if ($sql === false) {
                throw new RuntimeException("마이그레이션을 읽을 수 없습니다: {$name}");
            }

            // SQL과 장부 기록을 함께 커밋해 부분 적용을 막는다
            $db->beginTransaction();
            try {
                $db->exec($sql);
                $insert = $db->prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (:name, :applied_at)');
                $insert->execute(['name' => $name, 'applied_at' => gmdate('c')]);
                $db->commit();
            } catch (Throwable $error) {
                $db->rollBack();
                throw $error;
            }
        }
    }
}
