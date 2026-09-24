<?php
// 문서의 행사 일시와 발행 시각을 한국 시간과 요일로 읽기 쉽게 적는다
declare(strict_types=1);

namespace CrowdCast\Records\Plans;

use DateTimeImmutable;
use DateTimeZone;

// 저장된 ISO 시각을 날짜·요일·시각 문구로 바꾼다
final class KoreanDate
{
    private const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

    // 한 행사 날짜 범위는 같은 날과 여러 날을 구별해 표시한다
    public function event(string $start, string $end, bool $unknownTime): string
    {
        $from = $this->kst($start);
        $to = $this->kst($end);
        $sameDay = $from->format('Y-m-d') === $to->format('Y-m-d');
        if ($sameDay) {
            $date = $this->date($from, true);
            return $unknownTime ? $date : $date . ' ' . $from->format('H:i') . '~' . $to->format('H:i');
        }

        // 연도가 바뀌는 행사에서는 양쪽 연도를 모두 적어 모호함을 없앤다
        $differentYears = $from->format('Y') !== $to->format('Y');
        $left = $this->date($from, $differentYears);
        $right = $this->date($to, $differentYears);
        return $unknownTime
            ? $left . ' ~ ' . $right
            : $left . ' ' . $from->format('H:i') . ' ~ ' . $right . ' ' . $to->format('H:i');
    }

    // 발행 시각은 단일 시점이므로 연도와 한국 시각을 모두 적는다
    public function published(string $timestamp): string
    {
        $date = $this->kst($timestamp);
        return $this->date($date, true) . ' ' . $date->format('H:i');
    }

    // 원문 오프셋과 상관없이 문서 표시에는 한국 시간대를 쓴다
    private function kst(string $timestamp): DateTimeImmutable
    {
        return (new DateTimeImmutable($timestamp))->setTimezone(new DateTimeZone('Asia/Seoul'));
    }

    // 날짜의 요일은 PHP 날짜 계산 결과를 한국어 한 글자로 붙인다
    private function date(DateTimeImmutable $date, bool $year): string
    {
        $prefix = $year ? $date->format('Y') . '년 ' : '';
        return $prefix . (int) $date->format('n') . '월 ' . (int) $date->format('j') . '일('
            . self::WEEKDAYS[(int) $date->format('w')] . ')';
    }
}
