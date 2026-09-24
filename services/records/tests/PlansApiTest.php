<?php
// 계획 초안의 HTTP 검사·수정 이력·docx 내용을 계약 픽스처로 시험한다
declare(strict_types=1);

namespace CrowdCast\Records\Tests;

use CrowdCast\Records\App;
use CrowdCast\Records\Plans\Exporter;
use CrowdCast\Records\Support\Db;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App as SlimApp;
use Slim\Psr7\Factory\ServerRequestFactory;
use ZipArchive;

// 영종 발행 예보서 하나로 계획의 모든 경계를 실제 라우트에서 확인한다
final class PlansApiTest extends TestCase
{
    private PDO $db;

    /** @var SlimApp<\DI\Container> */
    private SlimApp $app;

    // 테스트 DB마다 행사와 발행 스냅샷을 다시 넣는다
    protected function setUp(): void
    {
        $this->db = Db::connect('sqlite::memory:');
        $this->app = App::create($this->db);
        $this->request('POST', '/v1/events', $this->fixture('event/valid-yeongjong.json'));
        $this->request('POST', '/v1/events/e-yeongjong-fireworks-2025/snapshots', $this->fixture('forecast-report/valid-yeongjong.json'));
    }

    // 생성·조회 응답은 계약을 유지하고 클라이언트 시각을 서버 KST로 바꾼다
    public function testCreateReadAndDuplicate(): void
    {
        $plan = $this->plan();
        $created = $this->request('POST', '/v1/plans', $this->json($plan));
        self::assertSame(200, $created->getStatusCode(), (string) $created->getBody());
        $saved = $this->body($created);
        self::assertSame($plan['sections'], $saved['sections']);
        self::assertSame($saved, $this->body($this->request('GET', '/v1/plans/' . $plan['id'])));
        self::assertSame($saved['createdAt'], $saved['updatedAt']);
        self::assertStringEndsWith('+09:00', $saved['createdAt']);
        self::assertNotSame($plan['createdAt'], $saved['createdAt']);
        self::assertSame(409, $this->request('POST', '/v1/plans', $this->json($plan))->getStatusCode());
    }

    // 문장 원문의 한 글자·줄바꿈 차이, 누락·중복·순서 오류를 모두 거부한다
    public function testSectionAndBodyViolationsReturn422(): void
    {
        $base = $this->plan();
        $cases = [];
        $cases['한 글자'] = static function (array &$plan): void { $plan['sections'][0]['body'] .= '!'; };
        $cases['줄바꿈'] = static function (array &$plan): void { $plan['sections'][0]['body'] = str_replace("\n", ' ', $plan['sections'][0]['body']); };
        $cases['누락'] = static function (array &$plan): void { array_pop($plan['sections']); };
        $cases['중복'] = static function (array &$plan): void { $plan['sections'][1]['key'] = 'overview'; };
        $cases['순서'] = static function (array &$plan): void { [$plan['sections'][0], $plan['sections'][1]] = [$plan['sections'][1], $plan['sections'][0]]; };
        $cases['발행 문장 없음'] = static function (array &$plan): void { $plan['sections'][0] = json_decode((string) file_get_contents(dirname(__DIR__, 3) . '/packages/contracts/fixtures/plan-section/invalid-written-without-claims.json'), true, 512, JSON_THROW_ON_ERROR); };
        $cases['미발행 ID'] = static function (array &$plan): void { $plan['sections'][0]['claimIds'] = ['c-unpublished-1']; };
        $cases['다른 세션 ID'] = static function (array &$plan): void { $plan['sections'][0]['claimIds'] = ['c-other-session']; };
        $cases['없는 수치'] = static function (array &$plan): void { $plan['sections'][0]['lockedFields'] = [['name' => '순간 최대', 'value' => '1명', 'quantityId' => 'q-missing']]; };
        foreach ($cases as $name => $change) {
            $plan = $base;
            $change($plan);
            $response = $this->request('POST', '/v1/plans', $this->json($plan));
            self::assertSame(422, $response->getStatusCode(), $name . ': ' . (string) $response->getBody());
            self::assertNotEmpty($this->body($response)['message'], $name);
        }
        self::assertSame(0, (int) $this->db->query('SELECT COUNT(*) FROM plans')->fetchColumn());
    }

    // 없는 스냅샷과 다른 행사·세션 참조는 저장 전에 거부한다
    public function testSnapshotOwnership(): void
    {
        foreach (['forecastId' => 'f-missing', 'eventId' => 'e-other-event', 'sessionId' => 's-other-0001'] as $field => $value) {
            $plan = $this->plan();
            $plan[$field] = $value;
            $response = $this->request('POST', '/v1/plans', $this->json($plan));
            self::assertSame(422, $response->getStatusCode(), $field);
            self::assertStringContainsString($field, $this->body($response)['message']);
        }
    }

    // 저장본 내부에 다른 세션·미발행 문장이 있어도 본문에 인용하지 않는다
    public function testInspectorRejectsForeignOrUnpublishedStoredClaims(): void
    {
        foreach (['sessionId' => 's-other-0001', 'status' => 'candidate'] as $field => $value) {
            $this->db = Db::connect('sqlite::memory:');
            $this->app = App::create($this->db);
            $this->request('GET', '/v1/events');
            $event = $this->fixture('event/valid-yeongjong.json');
            $report = json_decode($this->fixture('forecast-report/valid-yeongjong.json'), true, 512, JSON_THROW_ON_ERROR);
            $report['claims'][0][$field] = $value;
            $this->db->prepare('INSERT INTO events (id, event_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
                ->execute(['e-yeongjong-fireworks-2025', $event, '2025-10-04', '2025-10-04']);
            $this->db->prepare('INSERT INTO forecast_snapshots (forecast_id, event_id, published_at, report_json) VALUES (?, ?, ?, ?)')
                ->execute([$report['forecastId'], $report['event']['id'], $report['publishedAt'], $this->json($report)]);
            $response = $this->request('POST', '/v1/plans', $this->json($this->plan()));
            self::assertSame(422, $response->getStatusCode(), $field);
            self::assertStringContainsString('발행 문장', $this->body($response)['message'], $field);
        }
    }

    // 여러 번 수정해도 최초 본문과 중간 본문을 순서대로 남긴다
    public function testPutPreservesEveryPreviousBody(): void
    {
        $initial = $this->body($this->request('POST', '/v1/plans', $this->json($this->plan())));
        $changed = $initial;
        $changed['title'] = '영종 불꽃축제 안전관리계획 수정본';
        $changed['sections'][1]['title'] = '조직과 연락망';
        $first = $this->request('PUT', '/v1/plans/' . $initial['id'], $this->json($changed));
        self::assertSame(200, $first->getStatusCode(), (string) $first->getBody());
        $afterFirst = $this->body($first);
        $changedAgain = $afterFirst;
        $changedAgain['sections'][1]['title'] = '조직 및 역할';
        self::assertSame(200, $this->request('PUT', '/v1/plans/' . $initial['id'], $this->json($changedAgain))->getStatusCode());

        // 각 수정 직전의 계획 전체를 읽을 수 있어 이전 본문을 복구할 수 있다
        $revisions = $this->db->query('SELECT previous_plan_json FROM plan_revisions ORDER BY revision')->fetchAll(PDO::FETCH_COLUMN);
        self::assertCount(2, $revisions);
        self::assertSame($initial, json_decode($revisions[0], true, 512, JSON_THROW_ON_ERROR));
        self::assertSame($afterFirst, json_decode($revisions[1], true, 512, JSON_THROW_ON_ERROR));
        self::assertSame(422, $this->request('PUT', '/v1/plans/plan-other', $this->json($changedAgain))->getStatusCode());
    }

    // docx의 표·본문·각주·서체·머리말과 반복 내보내기 결과를 읽는다
    public function testDocxContainsSnapshotValuesAndEvidence(): void
    {
        $plan = $this->plan();
        $this->request('POST', '/v1/plans', $this->json($plan));
        $first = $this->request('GET', '/v1/plans/' . $plan['id'] . '/export.docx');
        self::assertSame(200, $first->getStatusCode(), (string) $first->getBody());
        self::assertSame('application/vnd.openxmlformats-officedocument.wordprocessingml.document', $first->getHeaderLine('Content-Type'));
        $document = $this->part((string) $first->getBody(), 'word/document.xml');
        $styles = $this->part((string) $first->getBody(), 'word/styles.xml');
        $footnotes = $this->part((string) $first->getBody(), 'word/footnotes.xml');
        $header = $this->part((string) $first->getBody(), 'word/header1.xml');
        $footer = $this->part((string) $first->getBody(), 'word/footer1.xml');
        $properties = $this->part((string) $first->getBody(), 'docProps/core.xml');
        foreach ($plan['sections'] as $section) {
            self::assertStringContainsString($section['title'], $document);
        }
        foreach (['참고용 초안 — 담당자 검토 필수', '영종 씨사이드파크 불꽃축제', '12,000 ~ 35,000 명', '13,000 명/일', '대규모', 'w:footnoteReference'] as $text) {
            self::assertStringContainsString($text, $document);
        }
        self::assertStringContainsString('함초롬바탕', $styles);
        self::assertStringContainsString('맑은 고딕', $styles);
        self::assertStringContainsString('w:line="384"', $styles);
        self::assertStringContainsString('w:w="11906" w:h="16838"', $document);
        self::assertStringContainsString('인원 무관 대상(폭죽)', $footnotes);
        self::assertStringContainsString('참고용 초안 — 담당자 검토 필수', $header);
        self::assertStringContainsString('f-yeongjong-2025', $footer);
        self::assertStringContainsString('2026-09-24T20:00:15+09:00', $footer);
        $saved = $this->body($this->request('GET', '/v1/plans/' . $plan['id']));
        $timestamp = gmdate('Y-m-d\TH:i:s+00:00', strtotime($saved['updatedAt']));
        self::assertSame(2, substr_count($properties, $timestamp));
        self::assertSame($document, $this->part((string) $this->request('GET', '/v1/plans/' . $plan['id'] . '/export.docx')->getBody(), 'word/document.xml'));

        // 별도 실행에서만 테스트 DB로 만든 사람이 열어 볼 예시 문서를 남긴다
        $destination = getenv('CROWDCAST_EXAMPLE_DOCX_PATH');
        if ($destination !== false && $destination !== '') {
            $report = json_decode($this->fixture('forecast-report/valid-yeongjong.json'), true, 512, JSON_THROW_ON_ERROR);
            self::assertNotFalse(file_put_contents($destination, (new Exporter())->render($saved, $report, true)));
        }
    }

    // 테스트용 계획은 첫 섹션만 발행 문장 두 개로 채운다
    /** @return array<string, mixed> */
    private function plan(): array
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
        $report = json_decode($this->fixture('forecast-report/valid-yeongjong.json'), true, 512, JSON_THROW_ON_ERROR);
        $sections[0]['status'] = '작성됨';
        $sections[0]['claimIds'] = array_column($report['claims'], 'id');
        $sections[0]['body'] = implode("\n", array_column($report['claims'], 'rendered'));
        $sections[0]['lockedFields'] = [[
            'name' => '순간 최대', 'value' => '21,000명', 'quantityId' => 'q-f-yeongjong-2025-peak',
        ]];
        return [
            'id' => 'plan-yeongjong-example', 'forecastId' => $report['forecastId'],
            'eventId' => $report['event']['id'], 'sessionId' => $report['sessionId'],
            'title' => '영종 씨사이드파크 불꽃축제 안전관리계획 초안',
            'createdAt' => '2000-01-01T00:00:00+09:00', 'updatedAt' => '2000-01-01T00:00:00+09:00',
            'sections' => $sections, 'watermark' => '참고용 초안 — 담당자 검토 필수',
        ];
    }

    // 계약 픽스처를 테스트 입력으로 읽는다
    private function fixture(string $name): string
    {
        return (string) file_get_contents(dirname(__DIR__, 3) . '/packages/contracts/fixtures/' . $name);
    }

    // 요청을 실제 Slim 라우터에서 실행한다
    private function request(string $method, string $path, string $json = ''): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, $path);
        $request->getBody()->write($json);
        return $this->app->handle($request);
    }

    // 응답 JSON은 배열로 비교한다
    /** @return array<string, mixed> */
    private function body(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }

    // 중간 입력에서도 한국어를 원문으로 유지한다
    /** @param array<string, mixed> $value */
    private function json(array $value): string
    {
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    }

    // ZipArchive로 docx 내부의 특정 XML을 읽는다
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
