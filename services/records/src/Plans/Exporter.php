<?php
// 발행 스냅샷의 값과 근거를 편집 가능한 안전관리계획 docx로 만든다
declare(strict_types=1);

namespace CrowdCast\Records\Plans;

use DateTimeImmutable;
use PhpOffice\PhpWord\Element\Section;
use PhpOffice\PhpWord\IOFactory;
use PhpOffice\PhpWord\PhpWord;
use PhpOffice\PhpWord\Settings;
use RuntimeException;

// 문장별 근거 각주와 모든 쪽의 참고용 문구를 PHPWord로 기록한다
final class Exporter
{
    // 저장된 초안만 문서화하며 예시 산출물에는 첫 줄에 테스트 데이터임을 밝힌다
    /**
     * @param array<string, mixed> $plan
     * @param array<string, mixed> $report
     */
    public function render(array $plan, array $report, bool $example = false): string
    {
        // PHPWord는 기본값으로 동적 텍스트의 XML 이스케이프를 끄므로 먼저 켠다
        Settings::setOutputEscapingEnabled(true);
        $word = new PhpWord();
        $word->setDefaultFontName('함초롬바탕');
        $word->setDefaultAsianFontName('함초롬바탕');
        $word->setDefaultFontSize(11);
        $word->addFontStyle('PlanBody', ['name' => '함초롬바탕', 'size' => 11]);
        $word->addFontStyle('PlanHeading', ['name' => '맑은 고딕', 'size' => 15, 'bold' => true]);
        $word->addFontStyle('PlanTable', ['name' => '맑은 고딕', 'size' => 10]);
        $word->addParagraphStyle('PlanParagraph', ['lineHeight' => 1.6, 'spaceAfter' => 120]);

        // 문서 메타데이터는 계획 수정 시각으로 고정한다
        $updated = (new DateTimeImmutable($plan['updatedAt']))->getTimestamp();
        $word->getDocInfo()->setCreated($updated);
        $word->getDocInfo()->setModified($updated);
        $word->getDocInfo()->setTitle($plan['title']);
        $section = $word->addSection([
            'pageSizeW' => 11906, 'pageSizeH' => 16838,
            'marginTop' => 1200, 'marginBottom' => 1200,
        ]);

        // 모든 쪽 머리말과 바닥글에 검토 문구·발행 정보를 반복한다
        $section->addHeader()->addText($plan['watermark'], ['name' => '맑은 고딕', 'size' => 10, 'color' => '888888']);
        $footer = $section->addFooter();
        $footer->addPreserveText(
            '쪽 {PAGE} · 예보 ' . $report['forecastId'] . ' · 발행 '
                . (new KoreanDate())->published($report['publishedAt']),
            ['name' => '맑은 고딕', 'size' => 9]
        );

        // 공개 자료와 혼동할 수 있는 예시 파일에만 테스트 DB 표시를 넣는다
        if ($example) {
            $section->addText('테스트 DB로 만든 영종 예시 — 공개 원장·실데이터 아님', 'PlanTable');
        }
        $section->addText($plan['watermark'], ['name' => '맑은 고딕', 'size' => 9, 'color' => '888888']);
        $section->addText($plan['title'], 'PlanHeading', ['spaceAfter' => 240]);
        $this->summary($section, $report);

        // 본문은 저장 검사와 같은 claimIds 순서로 써 줄바꿈을 문단으로 보존한다
        $claims = array_column($report['claims'], null, 'id');
        $evidence = array_column($report['evidence'], null, 'id');
        foreach ($plan['sections'] as $planSection) {
            $heading = $planSection['title'] . ($planSection['status'] === '검토 필요' ? ' [검토 필요]' : '');
            $section->addText($heading, 'PlanHeading', ['spaceBefore' => 240, 'spaceAfter' => 80]);
            if ($planSection['claimIds'] === []) {
                $section->addText('담당자가 내용을 검토하고 필요한 사항을 작성해 주세요.', 'PlanBody', 'PlanParagraph');
                continue;
            }
            foreach ($planSection['claimIds'] as $claimId) {
                $claim = $claims[$claimId];
                $run = $section->addTextRun('PlanParagraph');
                $run->addText($claim['rendered'], 'PlanBody');
                foreach ($claim['evidenceIds'] as $evidenceId) {
                    if (!isset($evidence[$evidenceId])) {
                        throw new RuntimeException("스냅샷 근거가 없습니다: {$evidenceId}");
                    }
                    $note = $run->addFootnote();
                    $note->addText((new EvidenceLabel())->format($evidence[$evidenceId], $report), 'PlanTable');
                }
            }
        }

        // 파일 경로는 내보내기 호출에서만 쓰고 바이트를 읽은 뒤 지운다
        $path = tempnam(sys_get_temp_dir(), 'crowdcast-plan-');
        if ($path === false) {
            throw new RuntimeException('docx 임시 파일을 만들 수 없습니다');
        }
        try {
            IOFactory::createWriter($word, 'Word2007')->save($path);
            $bytes = file_get_contents($path);
            if ($bytes === false) {
                throw new RuntimeException('docx 파일을 읽을 수 없습니다');
            }
            return $bytes;
        } finally {
            unlink($path);
        }
    }

    // 행사 요약의 모든 날짜·판정·인원 수치는 발행 스냅샷의 필드에서 읽는다
    /** @param array<string, mixed> $report */
    private function summary(Section $section, array $report): void
    {
        $event = $report['event'];
        $card = $report['card'];
        $peak = $card['peakConcurrent'];
        $mean = $card['dailyMean'];
        $rows = [
            ['행사명', $event['name']],
            ['일시', (new KoreanDate())->event(
                $event['startsAt'],
                $event['endsAt'],
                $event['timeOfDay'] === '미상'
            )],
            ['장소', $event['venue']['name'] . ' · ' . $event['sigunguName']],
            ['판정 등급', $card['judgment']['label'] . ' (' . $card['judgment']['level'] . '등급)'],
            ['순간 최대 p10~p90', $this->range($peak)],
            ['일평균', number_format($mean['p50']) . ' ' . $mean['unit'] . ' (p50)'],
        ];
        $table = $section->addTable(['borderSize' => 4, 'borderColor' => 'C7C7C7', 'cellMargin' => 100]);
        foreach ($rows as [$label, $value]) {
            $table->addRow();
            $table->addCell(3000)->addText($label, 'PlanTable');
            $table->addCell(6500)->addText($value, 'PlanTable');
        }
    }

    // 사람 수는 정수로 0.5 올림해 보이고 원래 구간·단위·추정 표시를 유지한다
    /** @param array<string, mixed> $quantity */
    private function range(array $quantity): string
    {
        $label = number_format($quantity['p10'], 0, '.', ',') . ' ~ '
            . number_format($quantity['p90'], 0, '.', ',') . ' ' . $quantity['unit'];
        return $quantity['estimated'] ? $label . ' (추정)' : $label;
    }
}
