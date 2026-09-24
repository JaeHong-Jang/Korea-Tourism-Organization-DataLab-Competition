<?php
// 기록 서비스의 SQLite 마이그레이션을 명령줄에서 적용한다
declare(strict_types=1);

use CrowdCast\Records\Support\Db;
use CrowdCast\Records\Support\Migrator;

require dirname(__DIR__) . '/vendor/autoload.php';

// 저장 경로는 Db가 환경 변수 또는 레포 루트에서 결정한다
Migrator::run(Db::connect());
fwrite(STDOUT, "records 마이그레이션 완료\n");
