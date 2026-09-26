<?php
// 영종 발행 예보서로 계약에 맞는 계획 입력을 만든다
declare(strict_types=1);

namespace CrowdCast\Records\Tests;

// 저장 API와 문서 테스트가 같은 아홉 섹션 초안을 사용한다
final class PlanFixture
{
    // 실제 한국 행사 픽스처의 발행 문장과 잠금 수치를 원문으로 넣는다
    /** @return array<string, mixed> */
    public static function example(): array
    {
        $titles = [
            'overview' => '개요', 'organization' => '안전관리 조직', 'crowd-timeline' => '시간대별 인파',
            'routes-evacuation' => '동선과 대피', 'staffing' => '인력 배치', 'traffic-parking' => '교통과 주차',
            'medical-toilets' => '의료와 화장실', 'weather-emergency' => '기상과 비상 대응',
            'non-crowd-risks' => '인파 외 위험',
        ];
        $sections = [];
        foreach ($titles as $key => $title) {
            $sections[] = [
                'key' => $key, 'title' => $title, 'status' => '검토 필요',
                'claimIds' => [], 'body' => '', 'lockedFields' => [],
            ];
        }
        $report = self::report();
        $sections[0]['status'] = '작성됨';
        $sections[0]['claimIds'] = array_column($report['claims'], 'id');
        $sections[0]['body'] = implode("\n", array_column($report['claims'], 'rendered'));
        $sections[0]['lockedFields'] = [[
            'name' => 'p50', 'value' => '21000 명', 'quantityId' => 'q-f-yeongjong-2025-peak',
        ]];
        return [
            'id' => 'plan-yeongjong-example', 'forecastId' => $report['forecastId'],
            'eventId' => $report['event']['id'], 'sessionId' => $report['sessionId'],
            'title' => '영종 씨사이드파크 불꽃축제 안전관리계획 초안',
            'createdAt' => '2000-01-01T00:00:00+09:00', 'updatedAt' => '2000-01-01T00:00:00+09:00',
            'sections' => $sections, 'watermark' => '참고용 초안 — 담당자 검토 필수',
        ];
    }

    // 발행 예보서 원문을 테스트 배열로 읽는다
    /** @return array<string, mixed> */
    public static function report(): array
    {
        $path = dirname(__DIR__, 3) . '/packages/contracts/fixtures/forecast-report/valid-yeongjong.json';
        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }
}
