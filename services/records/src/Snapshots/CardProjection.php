<?php
// 예보의 숫자 카드를 계약 규칙과 같은 필드로 투영하고 비교한다
declare(strict_types=1);

namespace CrowdCast\Records\Snapshots;

// 발행 카드가 결정적 예보 값만 담았는지 확인한다
final class CardProjection
{
    // 계약의 projectCard와 같은 열한 필드를 예보에서 옮긴다
    public static function project(object $forecast): object
    {
        $reasons = array_map(
            static fn(object $reason): object => (object) [
                'ruleId' => $reason->ruleId,
                'kind' => $reason->kind,
                'text' => $reason->text,
            ],
            $forecast->judgment->reasons
        );
        return (object) [
            'id' => $forecast->id,
            'eventId' => $forecast->eventId,
            'asOf' => $forecast->asOf,
            'modelVersion' => $forecast->modelVersion,
            'dailyMean' => $forecast->dailyMean,
            'peakConcurrent' => $forecast->peakConcurrent,
            'probabilities' => $forecast->probabilities,
            'peakHours' => $forecast->peakHours,
            'judgment' => (object) [
                'level' => $forecast->judgment->level,
                'label' => $forecast->judgment->label,
                'reasons' => $reasons,
            ],
            'ood' => $forecast->ood,
            'oodReasons' => $forecast->oodReasons,
        ];
    }

    // 객체 키 순서와 무관한 JSON 표현으로 계약 canonical을 옮긴다
    public static function canonical(mixed $value): string
    {
        if (is_array($value)) {
            return '[' . implode(',', array_map(self::canonical(...), $value)) . ']';
        }
        if (is_object($value)) {
            $properties = get_object_vars($value);
            ksort($properties, SORT_STRING);
            $pairs = [];
            foreach ($properties as $key => $item) {
                $pairs[] = json_encode((string) $key, JSON_THROW_ON_ERROR) . ':' . self::canonical($item);
            }
            return '{' . implode(',', $pairs) . '}';
        }
        // 정수 값인 실수(7.0·-0.0)는 JS의 JSON.stringify처럼 정수(7·0)로 적어 두 언어 판정을 맞춘다
        if (is_float($value) && is_finite($value) && floor($value) === $value && abs($value) < 9007199254740992) {
            return json_encode((int) $value, JSON_THROW_ON_ERROR);
        }
        return json_encode($value, JSON_THROW_ON_ERROR);
    }

    // 다른 최상위 카드 필드 이름을 돌려준다
    /** @return list<string> */
    public static function diff(object $card, object $forecast): array
    {
        $want = get_object_vars(self::project($forecast));
        $have = get_object_vars($card);
        $different = [];
        foreach (array_unique(array_merge(array_keys($have), array_keys($want))) as $key) {
            if (!array_key_exists($key, $have) || !array_key_exists($key, $want)
                || self::canonical($have[$key]) !== self::canonical($want[$key])) {
                $different[] = $key;
            }
        }
        return $different;
    }
}
