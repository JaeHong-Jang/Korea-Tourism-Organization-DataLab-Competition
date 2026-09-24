<?php
// 예보 단건 조회와 실측·공유 링크의 HTTP 및 저장 불변성을 검증한다
declare(strict_types=1);

namespace CrowdCast\Records\Tests;

use CrowdCast\Records\Actuals\Repository as ActualRepository;
use CrowdCast\Records\App;
use CrowdCast\Records\Support\Db;
use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App as SlimApp;
use Slim\Psr7\Factory\ServerRequestFactory;

// 실제 Slim 라우트와 메모리 DB를 통해 새 기록 경로를 검사한다
final class T505ApiTest extends TestCase
{
    private PDO $db;

    /** @var SlimApp<\DI\Container> */
    private SlimApp $app;

    // 각 테스트의 행사와 발행 기록을 독립시킨다
    protected function setUp(): void
    {
        $this->db = Db::connect('sqlite::memory:');
        $this->app = App::create($this->db);
    }

    // 발행본은 ID로 원문을 열고 삭제 표시된 행사도 계속 연다
    public function testSnapshotByForecastId(): void
    {
        $report = $this->publishedReport();
        self::assertSame($report, (string) $this->request('GET', '/v1/snapshots/f-yeongjong-2025')->getBody());
        self::assertSame(404, $this->request('GET', '/v1/snapshots/f-unknown-2025')->getStatusCode());
        self::assertSame(204, $this->request('DELETE', '/v1/events/e-yeongjong-fireworks-2025')->getStatusCode());
        self::assertSame($report, (string) $this->request('GET', '/v1/snapshots/f-yeongjong-2025')->getBody());
        self::assertSame(1, (int) $this->db->query("SELECT COUNT(*) FROM sqlite_master WHERE name = 'sqlite_autoindex_forecast_snapshots_1'")->fetchColumn());
    }

    // 실측은 계약의 단위 정보를 요구하고 예측·없는 행사는 422로 거부한다
    public function testActualValidationAndHistory(): void
    {
        $this->request('POST', '/v1/events', $this->fixture('event/valid-yeongjong.json'));
        $actual = $this->actual();
        foreach (['unit', 'timeUnit', 'spatialScope', 'valueKind'] as $field) {
            $invalid = $actual;
            unset($invalid['actual'][$field]);
            self::assertSame(422, $this->request('POST', '/v1/actuals', json_encode($invalid, JSON_THROW_ON_ERROR))->getStatusCode(), $field);
        }
        foreach (['예측', '사전예상'] as $kind) {
            $invalid = $actual;
            $invalid['actual']['valueKind'] = $kind;
            self::assertSame(422, $this->request('POST', '/v1/actuals', json_encode($invalid, JSON_THROW_ON_ERROR))->getStatusCode());
        }
        $estimated = $actual;
        $estimated['actual']['estimated'] = true;
        self::assertSame(422, $this->request('POST', '/v1/actuals', json_encode($estimated, JSON_THROW_ON_ERROR))->getStatusCode());
        $withoutValue = $actual;
        $withoutValue['actual']['value'] = null;
        self::assertSame(422, $this->request('POST', '/v1/actuals', json_encode($withoutValue, JSON_THROW_ON_ERROR))->getStatusCode());
        $missingEvent = $actual;
        $missingEvent['eventId'] = 'e-unknown-2025';
        self::assertSame(422, $this->request('POST', '/v1/actuals', json_encode($missingEvent, JSON_THROW_ON_ERROR))->getStatusCode());

        // 입력 순번으로 같은 초에 작성된 정정값도 최신으로 선택한다
        $first = $this->body($this->request('POST', '/v1/actuals', json_encode($actual, JSON_THROW_ON_ERROR)));
        $actual['actual']['value'] = 3200;
        $actual['actual']['valueKind'] = '사후집계';
        $second = $this->body($this->request('POST', '/v1/actuals', json_encode($actual, JSON_THROW_ON_ERROR)));
        self::assertSame(1, $first['id']);
        self::assertSame(2, $second['id']);
        self::assertSame(3200, $second['actual']['value']);
        self::assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+09:00$/', $second['recordedAt']);
        $repository = new ActualRepository($this->db);
        self::assertSame(2, $repository->latest($actual['eventId'])['id']);
        self::assertCount(2, $repository->history($actual['eventId']));
    }

    // SQL 변경 구문은 첫 실측 행을 바꾸거나 지우지 못한다
    public function testActualCannotBeMutated(): void
    {
        $this->request('POST', '/v1/events', $this->fixture('event/valid-yeongjong.json'));
        $this->request('POST', '/v1/actuals', json_encode($this->actual(), JSON_THROW_ON_ERROR));
        $original = $this->db->query('SELECT rowid, * FROM actuals')->fetch();
        self::assertIsArray($original);
        foreach ([
            "UPDATE actuals SET actual_json = '{}' WHERE id = 1",
            'DELETE FROM actuals WHERE id = 1',
            "REPLACE INTO actuals (id, event_id, actual_json, recorded_at) VALUES (1, 'e-yeongjong-fireworks-2025', '{}', '2026-09-25')",
            "INSERT OR REPLACE INTO actuals (rowid, event_id, actual_json, recorded_at) VALUES (1, 'e-yeongjong-fireworks-2025', '{}', '2026-09-25')",
        ] as $sql) {
            try {
                $this->db->exec($sql);
                self::fail('실측 이력이 변경됨');
            } catch (PDOException $error) {
                self::assertStringContainsString('actual is immutable', $error->getMessage());
            }
            self::assertSame($original, $this->db->query('SELECT rowid, * FROM actuals')->fetch());
        }
    }

    // 토큰은 재요청에 재사용하며 없는 토큰은 발행 문서를 노출하지 않는다
    public function testShareTokenRoundTrip(): void
    {
        $report = $this->publishedReport();
        $request = '{"forecastId":"f-yeongjong-2025"}';
        $token = $this->body($this->request('POST', '/v1/shares', $request))['token'];
        self::assertMatchesRegularExpression('/^sh-[A-Za-z0-9_-]{32}$/D', $token);
        self::assertSame($token, $this->body($this->request('POST', '/v1/shares', $request))['token']);
        self::assertSame($report, (string) $this->request('GET', '/v1/shares/' . $token)->getBody());
        self::assertSame(204, $this->request('DELETE', '/v1/events/e-yeongjong-fireworks-2025')->getStatusCode());
        self::assertSame($report, (string) $this->request('GET', '/v1/shares/' . $token)->getBody());
        self::assertSame(404, $this->request('GET', '/v1/shares/sh-' . str_repeat('A', 32))->getStatusCode());
        self::assertSame(404, $this->request('POST', '/v1/shares', '{"forecastId":"f-unknown-2025"}')->getStatusCode());
        self::assertSame(1, (int) $this->db->query('SELECT COUNT(*) FROM shares')->fetchColumn());

        // 서로 다른 데이터베이스에서 같은 예보를 공유해도 난수 토큰은 같지 않다
        $otherDb = Db::connect('sqlite::memory:');
        $otherApp = App::create($otherDb);
        $event = (new ServerRequestFactory())->createServerRequest('POST', '/v1/events');
        $event->getBody()->write($this->fixture('event/valid-yeongjong.json'));
        $otherApp->handle($event);
        $snapshot = (new ServerRequestFactory())->createServerRequest('POST', '/v1/events/e-yeongjong-fireworks-2025/snapshots');
        $snapshot->getBody()->write($report);
        $otherApp->handle($snapshot);
        $share = (new ServerRequestFactory())->createServerRequest('POST', '/v1/shares');
        $share->getBody()->write($request);
        $otherToken = $this->body($otherApp->handle($share))['token'];
        self::assertNotSame($token, $otherToken);
    }

    // 계약 픽스처로 행사와 완전한 예보서를 발행한다
    private function publishedReport(): string
    {
        $eventId = 'e-yeongjong-fireworks-2025';
        $report = $this->fixture('forecast-report/valid-yeongjong.json');
        self::assertSame(200, $this->request('POST', '/v1/events', $this->fixture('event/valid-yeongjong.json'))->getStatusCode());
        self::assertSame(200, $this->request('POST', "/v1/events/{$eventId}/snapshots", $report)->getStatusCode());
        return $report;
    }

    // 주최측 사전 예상 수치를 행사장 관측 인원으로 바꿔 실측 요청을 만든다
    /** @return array<string, mixed> */
    private function actual(): array
    {
        $event = json_decode($this->fixture('event/valid-yeongjong.json'), true, 512, JSON_THROW_ON_ERROR);
        $quantity = $event['expectedByHost'];
        $quantity['id'] = 'q-e-yeongjong-observed';
        $quantity['name'] = '현장 관측 인원';
        $quantity['valueKind'] = '관측';
        $quantity['announcedAt'] = '2025-10-19';
        return ['eventId' => $event['id'], 'actual' => $quantity];
    }

    // Slim 요청에 JSON 원문을 넣어 응답을 받는다
    private function request(string $method, string $path, string $json = ''): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, $path);
        $request->getBody()->write($json);
        return $this->app->handle($request);
    }

    // JSON 응답을 키가 있는 배열로 읽는다
    /** @return array<string, mixed> */
    private function body(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }

    // 계약 픽스처는 서비스 테스트와 같은 정본 경로에서 읽는다
    private function fixture(string $name): string
    {
        return (string) file_get_contents(dirname(__DIR__, 3) . '/packages/contracts/fixtures/' . $name);
    }
}
