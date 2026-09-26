<?php
// 행사 CRUD와 불변 예보 스냅샷을 실제 Slim 경로에서 검사한다
declare(strict_types=1);

namespace CrowdCast\Records\Tests;

use CrowdCast\Records\App;
use CrowdCast\Records\Events\Repository as EventRepository;
use CrowdCast\Records\Snapshots\CardProjection;
use CrowdCast\Records\Snapshots\Repository as SnapshotRepository;
use CrowdCast\Records\Snapshots\Service as SnapshotService;
use CrowdCast\Records\Support\ContractValidator;
use CrowdCast\Records\Support\Db;
use InvalidArgumentException;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use RuntimeException;
use Slim\App as SlimApp;
use Slim\Psr7\Factory\ServerRequestFactory;

// 계약 픽스처를 HTTP 요청으로 보내 저장과 조회 결과를 대조한다
final class RecordsApiTest extends TestCase
{
    private PDO $db;

    /** @var SlimApp<\DI\Container> */
    private SlimApp $app;

    // 요청마다 독립된 SQLite를 사용해 발행 이력의 누출을 막는다
    protected function setUp(): void
    {
        $this->db = Db::connect('sqlite::memory:');
        $this->app = App::create($this->db);
    }

    // 행사를 저장·조회·삭제하면 활성 목록과 DB 삭제 표기가 일치한다
    public function testEventCrud(): void
    {
        $event = $this->fixture('event/valid-yeongjong.json');
        $id = 'e-yeongjong-fireworks-2025';

        // 생성 응답과 단건·목록 조회에서 계약 객체가 같아야 한다
        self::assertSame($event, (string) $this->request('POST', '/v1/events', $event)->getBody());
        self::assertSame($event, (string) $this->request('GET', "/v1/events/{$id}")->getBody());
        self::assertSame([json_decode($event, true)], $this->body($this->request('GET', '/v1/events')));

        // 삭제된 행사는 조회되지 않고 다시 삭제해도 성공으로 속이지 않는다
        self::assertSame(204, $this->request('DELETE', "/v1/events/{$id}")->getStatusCode());
        self::assertSame([], $this->body($this->request('GET', '/v1/events')));
        self::assertSame(404, $this->request('GET', "/v1/events/{$id}")->getStatusCode());
        self::assertSame(404, $this->request('DELETE', "/v1/events/{$id}")->getStatusCode());
    }

    // 잘못된 JSON·스키마·경로는 저장하지 않고 JSON 오류를 반환한다
    public function testInvalidRequestsReturnJson400(): void
    {
        $invalid = ['{}', '{broken', str_replace('영종 씨사이드파크 불꽃축제', '', $this->fixture('event/valid-yeongjong.json'))];
        foreach ($invalid as $json) {
            $response = $this->request('POST', '/v1/events', $json);
            self::assertSame(400, $response->getStatusCode());
            self::assertSame('invalid_event', $this->body($response)['error']);
            self::assertStringContainsString('application/json', $response->getHeaderLine('Content-Type'));
        }
        self::assertSame([], $this->body($this->request('GET', '/v1/events')));
        self::assertSame(400, $this->request('GET', '/v1/events/bad-id')->getStatusCode());
    }

    // 발행 예보서 전체가 저장·조회 뒤에도 같은 계약 객체와 원문을 유지한다
    public function testSnapshotRoundTripAndImmutability(): void
    {
        $event = $this->fixture('event/valid-yeongjong.json');
        $report = $this->fixture('forecast-report/valid-yeongjong.json');
        $path = '/v1/events/e-yeongjong-fireworks-2025/snapshots';
        $this->request('POST', '/v1/events', $event);

        // POST 본문과 GET 배열은 발행 예보서의 모든 필드를 유지한다
        self::assertSame($report, (string) $this->request('POST', $path, $report)->getBody());
        self::assertSame([json_decode($report, true)], $this->body($this->request('GET', $path)));
        self::assertSame($report, $this->db->query('SELECT report_json FROM forecast_snapshots')->fetchColumn());

        // 같은 예보 ID 재등록과 모든 수정·삭제 메서드는 409다
        self::assertSame(409, $this->request('POST', $path, $report)->getStatusCode());
        foreach (['PUT', 'PATCH', 'DELETE'] as $method) {
            self::assertSame(409, $this->request($method, $path, $report)->getStatusCode());
            self::assertSame(409, $this->request($method, $path . '/f-yeongjong-2025', $report)->getStatusCode());
        }
        self::assertSame($report, $this->db->query('SELECT report_json FROM forecast_snapshots')->fetchColumn());

        // 행사 삭제 뒤에도 DB의 발행 원문은 그대로 남는다
        self::assertSame(204, $this->request('DELETE', '/v1/events/e-yeongjong-fireworks-2025')->getStatusCode());
        self::assertSame($report, $this->db->query('SELECT report_json FROM forecast_snapshots')->fetchColumn());
        self::assertSame([json_decode($report, true)], $this->body($this->request('GET', $path)));
    }

    // 스키마 위반과 다른 행사 소속 문서는 저장하지 않는다
    public function testInvalidSnapshotReturns400(): void
    {
        $this->request('POST', '/v1/events', $this->fixture('event/valid-yeongjong.json'));
        $path = '/v1/events/e-yeongjong-fireworks-2025/snapshots';
        $invalid = $this->fixture('forecast-report/invalid-unpublished-claim.json');
        $response = $this->request('POST', $path, $invalid);
        self::assertSame(400, $response->getStatusCode());
        self::assertSame('invalid_forecast_report', $this->body($response)['error']);
        self::assertSame(0, (int) $this->db->query('SELECT COUNT(*) FROM forecast_snapshots')->fetchColumn());
    }

    // 발행 예보서의 모든 머리·문장 참조는 경로와 같은 예보·세션을 가리켜야 한다
    public function testMismatchedSnapshotIdsReturn400(): void
    {
        $eventId = 'e-yeongjong-fireworks-2025';
        $path = "/v1/events/{$eventId}/snapshots";
        $this->request('POST', '/v1/events', $this->fixture('event/valid-yeongjong.json'));
        $report = json_decode($this->fixture('forecast-report/valid-yeongjong.json'), true, 512, JSON_THROW_ON_ERROR);

        // 각각 독립적으로 바꿔 스키마가 허용하는 불일치도 저장되지 않는지 확인한다
        foreach (['forecastId', 'forecast.id', 'card.id', 'forecast.eventId', 'event.id', 'card.eventId', 'claims.forecastId', 'claims.sessionId'] as $field) {
            $changed = $report;
            match ($field) {
                'forecastId' => $changed['forecastId'] = 'f-other-2025',
                'forecast.id' => $changed['forecast']['id'] = 'f-other-2025',
                'card.id' => $changed['card']['id'] = 'f-other-2025',
                'forecast.eventId' => $changed['forecast']['eventId'] = 'e-other-event',
                'event.id' => $changed['event']['id'] = 'e-other-event',
                'card.eventId' => $changed['card']['eventId'] = 'e-other-event',
                'claims.forecastId' => $changed['claims'][0]['forecastId'] = 'f-other-2025',
                'claims.sessionId' => $changed['claims'][0]['sessionId'] = 's-other-0001',
            };
            $response = $this->request('POST', $path, json_encode($changed, JSON_THROW_ON_ERROR));
            self::assertSame(400, $response->getStatusCode(), $field);
            self::assertSame('invalid_forecast_report', $this->body($response)['error'], $field);
        }
        self::assertSame([], $this->body($this->request('GET', $path)));
    }

    // 저장소에서 읽은 스냅샷도 내부 ID가 어긋나면 송신하지 않는다
    public function testSnapshotResponseRejectsMismatchedIds(): void
    {
        $report = json_decode($this->fixture('forecast-report/valid-yeongjong.json'), true, 512, JSON_THROW_ON_ERROR);
        $report['claims'][0]['sessionId'] = 's-other-0001';
        $service = new SnapshotService(
            new SnapshotRepository($this->db),
            new EventRepository($this->db),
            new ContractValidator()
        );
        $this->request('POST', '/v1/events', $this->fixture('event/valid-yeongjong.json'));

        // 읽기 검증은 요청 검증과 동일한 소속 규칙을 적용한다
        $this->expectException(RuntimeException::class);
        $service->validateResponse('e-yeongjong-fireworks-2025', json_encode($report, JSON_THROW_ON_ERROR));
    }

    // 파서는 받아도 JSON 응답으로 되돌릴 수 없는 무한대 수치는 저장하지 않는다
    public function testOverflowNumbersReturn400WithoutBreakingLists(): void
    {
        $event = $this->fixture('event/valid-yeongjong.json');
        $overflowEvent = str_replace('"value": 2000', '"value": 1e400', $event);
        self::assertNotSame($event, $overflowEvent);
        self::assertSame(400, $this->request('POST', '/v1/events', $overflowEvent)->getStatusCode());
        self::assertSame([], $this->body($this->request('GET', '/v1/events')));

        // 정상 행사는 저장하고 예보서 내부의 무한대 수치만 거부한다
        $this->request('POST', '/v1/events', $event);
        $report = $this->fixture('forecast-report/valid-yeongjong.json');
        $overflowReport = str_replace('"value": 2000', '"value": 1e400', $report);
        self::assertNotSame($report, $overflowReport);
        $path = '/v1/events/e-yeongjong-fireworks-2025/snapshots';
        $response = $this->request('POST', $path, $overflowReport);
        self::assertSame(400, $response->getStatusCode());
        self::assertSame('invalid_forecast_report', $this->body($response)['error']);
        self::assertSame([], $this->body($this->request('GET', $path)));
        self::assertCount(1, $this->body($this->request('GET', '/v1/events')));
    }

    // 계약의 무결성 픽스처 전체에 대해 PHP 요청 판정과 파일 이름의 기대값을 대조한다
    public function testEveryForecastReportIntegrityFixtureMatchesContract(): void
    {
        $directory = dirname(__DIR__, 3) . '/packages/contracts/fixtures-integrity/forecast-report';
        $paths = glob($directory . '/*.json');
        self::assertNotFalse($paths);
        self::assertNotEmpty($paths);
        $service = new SnapshotService(
            new SnapshotRepository($this->db),
            new EventRepository($this->db),
            new ContractValidator()
        );

        // valid 파일만 통과시키고 invalid 파일은 요청과 저장본 검증에서 모두 거부한다
        foreach ($paths as $path) {
            $json = (string) file_get_contents($path);
            $report = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
            $eventId = $report['event']['id'];
            $valid = str_starts_with(basename($path), 'valid-');
            try {
                $service->validateRequest($eventId, $json);
                self::assertTrue($valid, basename($path));
            } catch (InvalidArgumentException) {
                self::assertFalse($valid, basename($path));
            }
            if (!$valid) {
                $response = $this->request('POST', "/v1/events/{$eventId}/snapshots", $json);
                self::assertSame(400, $response->getStatusCode(), basename($path));
                $rejected = false;
                try {
                    $service->validateResponse($eventId, $json);
                } catch (RuntimeException) {
                    $rejected = true;
                }
                self::assertTrue($rejected, '저장본 검증을 통과함: ' . basename($path));
            }
        }
        self::assertSame(0, (int) $this->db->query('SELECT COUNT(*) FROM forecast_snapshots')->fetchColumn());
    }

    // 카드 객체의 키 순서는 예보 투영의 값 비교에 영향을 주지 않는다
    public function testCardProjectionIgnoresObjectKeyOrder(): void
    {
        $json = $this->fixture('forecast-report/valid-yeongjong.json');
        $report = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        $report['card'] = array_reverse($report['card'], true);
        $service = new SnapshotService(
            new SnapshotRepository($this->db),
            new EventRepository($this->db),
            new ContractValidator()
        );
        self::assertSame($report['forecastId'], $service->validateRequest(
            $report['event']['id'],
            json_encode($report, JSON_THROW_ON_ERROR)
        )->forecastId);
    }

    // 다른 시간대의 발행 문자열은 원문을 보존하면서 실제 시각 순으로 읽는다
    public function testSnapshotsSortByInstantAcrossTimeZones(): void
    {
        $this->request('POST', '/v1/events', $this->fixture('event/valid-yeongjong.json'));
        $repository = new SnapshotRepository($this->db);
        $eventId = 'e-yeongjong-fireworks-2025';
        $repository->insert('f-late', $eventId, '2026-09-24T10:00:00+09:00', '{"id":"late"}');
        $repository->insert('f-early', $eventId, '2026-09-24T00:30:00Z', '{"id":"early"}');
        self::assertSame(['{"id":"early"}', '{"id":"late"}'], $repository->all($eventId));
    }

    // Slim에 JSON 본문을 넣어 실제 라우터의 응답을 받는다
    private function request(string $method, string $path, string $json = ''): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, $path);
        $request->getBody()->write($json);
        return $this->app->handle($request);
    }

    // JSON 응답을 배열로 해석해 필드 전체를 비교한다
    private function body(ResponseInterface $response): mixed
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }

    // 계약 픽스처 원문을 저장 왕복 테스트의 기준으로 읽는다
    private function fixture(string $name): string
    {
        return (string) file_get_contents(dirname(__DIR__, 3) . '/packages/contracts/fixtures/' . $name);
    }

    // 7과 7.0, 0과 -0.0은 계약 JS 판정처럼 같은 값으로 본다(스키마 integer·number는 둘 다 허용)
    public function testIntegralFloatsMatchJsCanonical(): void
    {
        self::assertSame(CardProjection::canonical(7), CardProjection::canonical(7.0));
        self::assertSame(CardProjection::canonical(0), CardProjection::canonical(-0.0));
        $json = (string) preg_replace('/("revision":\s*)7(\s*\})/', '${1}7.0${2}', $this->fixture('forecast-report/valid-yeongjong.json'));
        self::assertStringContainsString('7.0', $json);
        $service = new SnapshotService(
            new SnapshotRepository($this->db),
            new EventRepository($this->db),
            new ContractValidator()
        );
        self::assertSame('f-yeongjong-2025', $service->validateRequest('e-yeongjong-fireworks-2025', $json)->forecastId);
    }
}
