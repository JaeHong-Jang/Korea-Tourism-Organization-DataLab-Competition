<?php
// 저장된 사전 등록 원장을 검증한 뒤 공개 CSV로 내보낸다
declare(strict_types=1);

use CrowdCast\Records\Events\Repository as EventRepository;
use CrowdCast\Records\Ledger\Exporter;
use CrowdCast\Records\Ledger\Repository as LedgerRepository;
use CrowdCast\Records\Ledger\Service as LedgerService;
use CrowdCast\Records\Support\ContractValidator;
use CrowdCast\Records\Support\Db;
use CrowdCast\Records\Support\Migrator;

require dirname(__DIR__) . '/vendor/autoload.php';

// 원본 DB는 Db의 공유 데이터 경로에서 열고 변조된 원장은 공개하지 않는다
$db = Db::connect();
Migrator::run($db);
$ledger = new LedgerService(new LedgerRepository($db), new EventRepository($db), new ContractValidator());
$verification = $ledger->verify();
if (!$verification['valid']) {
    fwrite(STDERR, "원장 검증 실패: seq {$verification['brokenAt']}\n");
    exit(1);
}

// 레포의 고정된 공개 경로에 순번 순 CSV를 기록한다
$directory = dirname(__DIR__, 3) . '/reports/preregistered';
if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
    throw new RuntimeException("CSV 디렉터리를 만들 수 없습니다: {$directory}");
}
$path = $directory . '/ledger.csv';
Exporter::write($ledger->all(), $path);
fwrite(STDOUT, "원장 {$verification['count']}건 내보냄: {$path}\n");
