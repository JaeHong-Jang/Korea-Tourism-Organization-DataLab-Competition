<?php
// 검증된 원장 항목을 고정된 열 순서의 공개 CSV로 직렬화한다
declare(strict_types=1);

namespace CrowdCast\Records\Ledger;

use RuntimeException;

// 동일한 원장은 실행 시각과 무관하게 동일한 CSV 바이트를 만든다
final class Exporter
{
    // 각 행의 예보 네 필드와 세 해시를 계약 순서로 기록한다
    /** @param list<object> $entries */
    public static function write(array $entries, string $path): void
    {
        $stream = fopen('php://temp', 'w+');
        if ($stream === false) {
            throw new RuntimeException('CSV 임시 스트림을 열 수 없습니다');
        }
        fputcsv($stream, [
            'seq', 'forecastId', 'eventId', 'registeredAt', 'leadDays', 'dailyMeanP10',
            'dailyMeanP50', 'dailyMeanP90', 'level', 'payloadHash', 'prevHash', 'hash',
        ], ',', '"', '', "\n");
        foreach ($entries as $entry) {
            fputcsv($stream, [
                $entry->seq,
                $entry->forecastId,
                $entry->eventId,
                $entry->registeredAt,
                $entry->leadDays,
                $entry->forecast->dailyMeanP10,
                $entry->forecast->dailyMeanP50,
                $entry->forecast->dailyMeanP90,
                $entry->forecast->level,
                $entry->payloadHash,
                $entry->prevHash,
                $entry->hash,
            ], ',', '"', '', "\n");
        }

        // CSV를 메모리에서 완성한 뒤 목적 파일에 쓴다
        rewind($stream);
        $csv = stream_get_contents($stream);
        fclose($stream);
        if ($csv === false || file_put_contents($path, $csv) === false) {
            throw new RuntimeException('원장 CSV를 저장할 수 없습니다');
        }
    }
}
