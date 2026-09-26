<?php
// 원장 본문을 정본 JSON으로 직렬화하고 해시 체인을 계산한다
declare(strict_types=1);

namespace CrowdCast\Records\Ledger;

use stdClass;

// 키 정렬과 UTF-8 JSON 규칙을 한곳에 고정한다
final class Hash
{
    public const GENESIS = '0000000000000000000000000000000000000000000000000000000000000000';

    // 원장 본문의 여섯 필드만 정렬된 JSON으로 해시한다
    public static function payload(object $entry): string
    {
        $payload = (object) [
            'seq' => $entry->seq,
            'forecastId' => $entry->forecastId,
            'eventId' => $entry->eventId,
            'registeredAt' => $entry->registeredAt,
            'leadDays' => $entry->leadDays,
            'forecast' => $entry->forecast,
        ];
        return json_encode(
            self::sorted($payload),
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );
    }

    // 객체 키는 재귀적으로 정렬하고 배열 항목 순서는 보존한다
    private static function sorted(mixed $value): mixed
    {
        if ($value instanceof stdClass) {
            $fields = get_object_vars($value);
            ksort($fields, SORT_STRING);
            $sorted = new stdClass();
            foreach ($fields as $key => $field) {
                $sorted->{$key} = self::sorted($field);
            }
            return $sorted;
        }
        if (is_array($value)) {
            return array_map(self::sorted(...), $value);
        }
        return $value;
    }

    // 앞 행의 최종 해시와 현재 본문 해시를 이어 붙여 최종 해시를 만든다
    /** @return array{payloadHash: string, hash: string} */
    public static function pair(object $entry, string $prevHash): array
    {
        $payloadHash = hash('sha256', self::payload($entry));
        return ['payloadHash' => $payloadHash, 'hash' => hash('sha256', $prevHash . $payloadHash)];
    }
}
