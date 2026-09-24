<?php
// 안전관리계획 DOCX의 XML·날짜·근거 문구·정수 반올림을 검사한다
declare(strict_types=1);

namespace CrowdCast\Records\Tests;

use CrowdCast\Records\Plans\Exporter;
use DOMDocument;
use DOMXPath;
use PHPUnit\Framework\TestCase;
use ZipArchive;

// 발행 예보서 픽스처로 문서의 읽기 가능성과 표현 규칙을 확인한다
final class PlansDocumentTest extends TestCase
{
    // 문단 참조 ID와 스타일 정의 및 실제 런의 서체·크기를 함께 확인한다
    public function testStylesApplyToDocumentRuns(): void
    {
        $bytes = (new Exporter())->render(PlanFixture::example(), PlanFixture::report());
        $document = $this->part($bytes, 'word/document.xml');
        $styles = $this->part($bytes, 'word/styles.xml');
        $this->assertStyledParagraph($document, $styles, '개요', 'PlanHeading', '맑은 고딕', '30');
        $this->assertStyledParagraph($document, $styles, '행사명', 'PlanTable', '맑은 고딕', '20');
        $this->assertStyledParagraph(
            $document, $styles, '담당자가 내용을 검토하고 필요한 사항을 작성해 주세요.',
            'PlanParagraph', '함초롬바탕', '22'
        );
    }

    // 특수문자가 들어간 모든 텍스트 자리의 XML은 파서로 다시 읽을 수 있어야 한다
    public function testDocxEscapesTitlesBodyAndEvidence(): void
    {
        $plan = PlanFixture::example();
        $report = PlanFixture::report();
        $plan['title'] = '영종 안전 & 의료 <검토> "초안" \'확인\'';
        $plan['sections'][0]['title'] = $plan['title'];
        $report['claims'][0]['rendered'] = '안전 & 의료 <검토> "초안" \'확인\'';
        $report['evidence'][2]['title'] = '규칙 & <법정> "조항" \'원문\'';
        $bytes = (new Exporter())->render($plan, $report, true);
        foreach (['word/document.xml', 'word/footnotes.xml'] as $name) {
            $xml = new DOMDocument();
            self::assertTrue($xml->loadXML($this->part($bytes, $name)), $name);
        }
        self::assertStringContainsString('안전 &amp; 의료 &lt;검토&gt;', $this->part($bytes, 'word/document.xml'));
        $destination = getenv('CROWDCAST_ESCAPE_DOCX_PATH');
        if ($destination !== false && $destination !== '') {
            self::assertNotFalse(file_put_contents($destination, $bytes));
        }
    }

    // 한국 날짜 표기와 다섯 근거 종류의 설명을 별도 스냅샷 값으로 검사한다
    public function testDateAndFiveEvidenceKinds(): void
    {
        $date = new \CrowdCast\Records\Plans\KoreanDate();
        self::assertSame('2025년 10월 18일(토) 19:00~21:00', $date->event('2025-10-18T19:00:00+09:00', '2025-10-18T21:00:00+09:00', false));
        self::assertSame('10월 17일(금) 10:00 ~ 10월 19일(일) 21:00', $date->event('2025-10-17T10:00:00+09:00', '2025-10-19T21:00:00+09:00', false));
        self::assertSame('10월 17일(금) ~ 10월 19일(일)', $date->event('2025-10-17T00:00:00+09:00', '2025-10-19T00:00:00+09:00', true));
        $report = PlanFixture::report();
        $labels = new \CrowdCast\Records\Plans\EvidenceLabel();
        $byId = array_column($report['evidence'], null, 'id');
        self::assertStringContainsString('한국관광공사 · 한국관광공사_빅데이터_지역별 방문자수_GW · 기간 2025-09-06 ~ 2025-09-27 · 공개일 2025-10-01', $labels->format($byId['ev-baseline-28110'], $report));
        self::assertStringContainsString('모델 v0.1.0 · 학습 범위 2018-01-01 ~ 2024-12-31', $labels->format($byId['ev-model-f-yeongjong-2025'], $report));
        $modelWithOwnPeriod = $byId['ev-model-f-yeongjong-2025'];
        $modelWithOwnPeriod['period'] = ['from' => '2020-01-01', 'to' => '2023-12-31'];
        self::assertStringContainsString(
            '학습 범위 2020-01-01 ~ 2023-12-31',
            $labels->format($modelWithOwnPeriod, $report)
        );
        self::assertStringContainsString('법정 · 조항 law-disaster-act-enf-73-9', $labels->format($byId['ev-rule-legal-hazard'], $report));
        self::assertStringContainsString('피크일 계수 · 1일 행사 1.0(범위 0.8~1.2, 가정)', $labels->format($byId['ev-as-peak-day-factor'], $report));
        $case = $byId['ev-as-peak-day-factor'];
        $case['kind'] = 'case';
        $case['id'] = 'ev-case-yeongjong-example';
        $case['caseEventId'] = 'e-yeongjong-fireworks-2025';
        $case['period'] = ['from' => '2025-10-17', 'to' => '2025-10-19'];
        self::assertStringContainsString('행사 e-yeongjong-fireworks-2025 · 기간 2025-10-17 ~ 2025-10-19', $labels->format($case, $report));

        // 다섯 종류 모두 실제 DOCX 각주에 연결되는지 확인한다
        $report['evidence'][] = $case;
        $report['claims'][0]['evidenceIds'] = [
            'ev-baseline-28110', 'ev-model-f-yeongjong-2025', 'ev-rule-legal-hazard',
            'ev-as-peak-day-factor', 'ev-case-yeongjong-example',
        ];
        $footnotes = $this->part((new Exporter())->render(PlanFixture::example(), $report), 'word/footnotes.xml');
        foreach ($report['claims'][0]['evidenceIds'] as $evidenceId) {
            $evidence = $evidenceId === $case['id'] ? $case : $byId[$evidenceId];
            self::assertStringContainsString($labels->format($evidence, $report), $footnotes);
        }
    }

    // 사람 수 표시는 소수 .25는 내리고 .5는 올려 정수로 적는다
    public function testSummaryRoundsPeopleToNearestInteger(): void
    {
        $report = PlanFixture::report();
        $report['card']['peakConcurrent']['p10'] = 13000.25;
        $report['card']['peakConcurrent']['p90'] = 13000.5;
        $bytes = (new Exporter())->render(PlanFixture::example(), $report);
        self::assertStringContainsString('13,000 ~ 13,001 명', $this->part($bytes, 'word/document.xml'));
    }

    // 실제 문단의 ID와 해당 정의 및 런의 동아시아 서체·포인트 크기를 함께 대조한다
    private function assertStyledParagraph(
        string $document,
        string $styles,
        string $text,
        string $styleId,
        string $font,
        string $halfPoints
    ): void {
        $documentXml = new DOMDocument();
        self::assertTrue($documentXml->loadXML($document));
        $documentPath = new DOMXPath($documentXml);
        $documentPath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
        $paragraphs = $documentPath->query('//w:p[w:r/w:t = "' . $text . '"]');
        self::assertNotFalse($paragraphs);
        self::assertGreaterThan(0, $paragraphs->length, $text);
        $paragraph = $paragraphs->item(0);
        self::assertNotNull($paragraph);
        self::assertSame($styleId, $documentPath->evaluate('string(w:pPr/w:pStyle/@w:val)', $paragraph));
        self::assertSame($font, $documentPath->evaluate('string(w:r/w:rPr/w:rFonts/@w:eastAsia)', $paragraph));
        self::assertSame($halfPoints, $documentPath->evaluate('string(w:r/w:rPr/w:sz/@w:val)', $paragraph));

        // 참조된 문단 스타일 자체에도 같은 글자 정의가 있어야 편집 중 재적용된다
        $stylesXml = new DOMDocument();
        self::assertTrue($stylesXml->loadXML($styles));
        $stylesPath = new DOMXPath($stylesXml);
        $stylesPath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
        $definitions = $stylesPath->query('//w:style[@w:styleId="' . $styleId . '"]');
        self::assertNotFalse($definitions);
        self::assertSame(1, $definitions->length, $styleId);
        $definition = $definitions->item(0);
        self::assertNotNull($definition);
        self::assertSame($font, $stylesPath->evaluate('string(w:rPr/w:rFonts/@w:eastAsia)', $definition));
        self::assertSame($halfPoints, $stylesPath->evaluate('string(w:rPr/w:sz/@w:val)', $definition));
    }

    // ZipArchive로 DOCX 내부 XML을 읽는다
    private function part(string $bytes, string $name): string
    {
        $path = tempnam(sys_get_temp_dir(), 'plan-test-');
        self::assertNotFalse($path);
        file_put_contents($path, $bytes);
        $zip = new ZipArchive();
        self::assertTrue($zip->open($path) === true);
        $content = $zip->getFromName($name);
        $zip->close();
        unlink($path);
        self::assertNotFalse($content, $name);
        return $content;
    }
}
