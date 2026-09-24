<?php
// 기록 서비스의 SQLite 연결 경로와 필수 PDO 옵션을 관리한다
declare(strict_types=1);

namespace CrowdCast\Records\Support;

use PDO;
use RuntimeException;

// 기록 서비스와 테스트에 필요한 SQLite 연결을 만든다
final class Db
{
    // 테스트는 메모리 DSN을 전달하고 로컬 실행은 공유 데이터 루트를 사용한다
    public static function connect(?string $dsn = null): PDO
    {
        if ($dsn === null) {
            $root = getenv('CROWDCAST_DATA_ROOT');
            $root = $root !== false && $root !== '' ? $root : dirname(__DIR__, 4);
            $directory = rtrim($root, '/') . '/data/app';
            if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
                throw new RuntimeException("SQLite 디렉터리를 만들 수 없습니다: {$directory}");
            }
            $dsn = 'sqlite:' . $directory . '/records.sqlite';
        }

        // REPLACE의 암묵적 삭제에도 불변성 트리거가 실행되도록 연결을 설정한다
        $db = new PDO($dsn);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $db->exec('PRAGMA foreign_keys = ON');
        $db->exec('PRAGMA recursive_triggers = ON');
        return $db;
    }
}
