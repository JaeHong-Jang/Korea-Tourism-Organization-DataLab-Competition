<?php
// 사전 등록 원장의 API·해시 벡터·SQLite 불변성·CSV 재현성을 검사한다
declare(strict_types=1);

namespace CrowdCast\Records\Tests;

use CrowdCast\Records\App;
use CrowdCast\Records\Ledger\Exporter;
use CrowdCast\Records\Ledger\Hash;
use CrowdCast\Records\Support\ContractValidator;
use CrowdCast\Records\Support\Db;
use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App as SlimApp;
use Slim\Psr7\Factory\ServerRequestFactory;

// 실제 Slim 경로와 메모리 SQLite를 함께 사용해 저장본을 검증한다
final class LedgerTest extends TestCase
{
    private PDO $db;

    /** @var SlimApp<\DI\Container> */
    private SlimApp $app;

    // 각 테스트가 독립된 원장과 트리거를 사용한다
    protected function setUp(): void
    {
        $this->db = Db::connect('sqlite::memory:');
        $this->app = App::create($this->db);
    }

    // README의 정본 JSON과 두 SHA-256 값을 독립 계산값과 대조한다
    public function testReadmeHashVector(): void
    {
        $entry = (object) [
            'seq' => 1,
            'forecastId' => 'f-example-yeongjong-2025',
            'eventId' => 'e-yeongjong-fireworks-2025',
            'registeredAt' => '2026-09-29T09:00:00+09:00',
            'leadDays' => 5,
            'forecast' => (object) [
                'level' => 2,
                'dailyMeanP90' => 300,
                'dailyMeanP10' => 100,
                'dailyMeanP50' => 200,
            ],
        ];
        self::assertSame(
            '{"eventId":"e-yeongjong-fireworks-2025","forecast":{"dailyMeanP10":100,"dailyMeanP50":200,"dailyMeanP90":300,"level":2},"forecastId":"f-example-yeongjong-2025","leadDays":5,"registeredAt":"2026-09-29T09:00:00+09:00","seq":1}',
            Hash::payload($entry)
        );
        self::assertSame(
            [
                'payloadHash' => '910112546f85d22fca0491997d1ea3dbf40c01c145341c1aa9c8dd13c61c74c2',
                'hash' => '6062dd89784ba774946c37f5f254aee3367c91c736f25404028a41c064680a9f',
            ],
            Hash::pair($entry, Hash::GENESIS)
        );
    }

    // 세 건의 등록은 연속 순번·이전 해시·계약 응답을 남긴다
    public function testThreeEntriesVerifyAndExportDeterministically(): void
    {
        $this->createEvent();
        $entries = [];
        foreach ([1, 2, 3] as $number) {
            $response = $this->request('POST', '/v1/ledger', $this->requestJson($number));
            self::assertSame(200, $response->getStatusCode());
            $entry = $this->body($response);
            self::assertSame($number, $entry['seq']);
            self::assertTrue((new ContractValidator())->isValid('ledger-entry', json_decode((string) $response->getBody())));
            self::assertSame($number === 1 ? Hash::GENESIS : $entries[$number - 2]['hash'], $entry['prevHash']);
            self::assertMatchesRegularExpression('/\+09:00$/', $entry['registeredAt']);
            $entries[] = $entry;
        }
        self::assertEquals($entries, $this->body($this->request('GET', '/v1/ledger')));
        self::assertSame(['valid' => true, 'count' => 3, 'brokenAt' => null], $this->body(
            $this->request('GET', '/v1/ledger/verify')
        ));

        // 두 번 내보내도 공개 헤더와 세 행의 바이트가 같아야 한다
        $first = tempnam(sys_get_temp_dir(), 'ledger-one-');
        $second = tempnam(sys_get_temp_dir(), 'ledger-two-');
        self::assertNotFalse($first);
        self::assertNotFalse($second);
        try {
            $objects = array_map(static fn(array $entry): object => json_decode(
                json_encode($entry, JSON_THROW_ON_ERROR),
                false,
                512,
                JSON_THROW_ON_ERROR
            ), $entries);
            Exporter::write($objects, $first);
            Exporter::write($objects, $second);
            self::assertSame(file_get_contents($first), file_get_contents($second));
            self::assertCount(4, file($first));
            self::assertStringStartsWith('seq,forecastId,eventId,registeredAt,leadDays,', (string) file_get_contents($first));
        } finally {
            unlink($first);
            unlink($second);
        }
    }

    // 테스트 연결에서 불변 트리거를 제거해 본문을 바꾸면 첫 변조 순번을 찾는다
    public function testTamperedForecastReportsFirstBrokenSequence(): void
    {
        $this->createEvent();
        foreach ([1, 2, 3] as $number) {
            self::assertSame(200, $this->request('POST', '/v1/ledger', $this->requestJson($number))->getStatusCode());
        }
        $this->db->exec('DROP TRIGGER ledger_entries_no_update');
        $this->db->exec("UPDATE ledger_entries SET forecast_json = '{\"dailyMeanP10\":999,\"dailyMeanP50\":200,\"dailyMeanP90\":300,\"level\":2}' WHERE seq = 2");
        self::assertSame(['valid' => false, 'count' => 3, 'brokenAt' => 2], $this->body(
            $this->request('GET', '/v1/ledger/verify')
        ));
    }

    // 저장 타입과 JSON 정수 타입의 변조는 거부하고 키 순서 변경은 허용한다
    public function testStoredValueTypesAreCheckedWithoutCoercion(): void
    {
        $this->createEvent();
        foreach ([1, 2, 3] as $number) {
            self::assertSame(200, $this->request('POST', '/v1/ledger', $this->requestJson($number))->getStatusCode());
        }
        $this->db->exec('DROP TRIGGER ledger_entries_no_update');
        $updateLeadDays = $this->db->prepare('UPDATE ledger_entries SET lead_days = ? WHERE seq = 2');

        // SQLite의 INTEGER 친화도가 실수와 문자 값을 그대로 보관하는 경우를 검사한다
        foreach ([[5.5, 'real'], ['5changed', 'text']] as [$value, $storedType]) {
            $updateLeadDays->execute([$value]);
            self::assertSame($storedType, $this->db->query('SELECT typeof(lead_days) FROM ledger_entries WHERE seq = 2')->fetchColumn());
            self::assertSame(['valid' => false, 'count' => 3, 'brokenAt' => 2], $this->body(
                $this->request('GET', '/v1/ledger/verify')
            ));
        }
        $updateLeadDays->execute([5]);

        // 예보 숫자를 문자열로 바꾸면 값이 같아 보여도 원장 본문은 달라진다
        $updateForecast = $this->db->prepare('UPDATE ledger_entries SET forecast_json = ? WHERE seq = 2');
        $updateForecast->execute(['{"dailyMeanP10":200,"dailyMeanP50":400,"dailyMeanP90":600,"level":"2"}']);
        $stringLevelResponse = $this->request('GET', '/v1/ledger/verify');
        self::assertSame(['valid' => false, 'count' => 3, 'brokenAt' => 2], $this->body($stringLevelResponse));

        // 정본 직렬화는 객체 키를 정렬하므로 저장 JSON의 키 순서만 달라도 유효하다
        $updateForecast->execute(['{"level":2,"dailyMeanP90":600,"dailyMeanP10":200,"dailyMeanP50":400}']);
        self::assertSame(['valid' => true, 'count' => 3, 'brokenAt' => null], $this->body(
            $this->request('GET', '/v1/ledger/verify')
        ));
    }

    // 계약 위반·없는 행사·중복 예보는 원장에 기록되지 않는다
    public function testRequestValidationDeletedEventAndDuplicateForecast(): void
    {
        self::assertSame(404, $this->request('POST', '/v1/ledger', $this->requestJson(1))->getStatusCode());
        $this->createEvent();
        self::assertSame(204, $this->request('DELETE', '/v1/events/e-yeongjong-fireworks-2025')->getStatusCode());
        self::assertSame(200, $this->request('POST', '/v1/ledger', $this->requestJson(1))->getStatusCode());
        self::assertSame(409, $this->request('POST', '/v1/ledger', $this->requestJson(1))->getStatusCode());

        // 서버 전용 필드·실수·잘못된 ID·불완전한 예보를 각각 거부한다
        $invalid = [
            '{broken',
            '{}',
            str_replace('"leadDays":5', '"leadDays":5.0', $this->requestJson(2)),
            str_replace('"forecastId":"f-example-yeongjong-2"', '"forecastId":"bad"', $this->requestJson(2)),
            str_replace('"level":2', '"level":5', $this->requestJson(2)),
            str_replace('"level":2', '"level":2,"hash":"fake"', $this->requestJson(2)),
        ];
        foreach ($invalid as $json) {
            self::assertSame(400, $this->request('POST', '/v1/ledger', $json)->getStatusCode(), $json);
        }
        self::assertSame(['valid' => true, 'count' => 1, 'brokenAt' => null], $this->body(
            $this->request('GET', '/v1/ledger/verify')
        ));
    }

    // 모든 직접 수정과 충돌 삽입이 최초 원장 행을 보존한다
    public function testSqlMutationPathsAreRejected(): void
    {
        $this->createEvent();
        self::assertSame(200, $this->request('POST', '/v1/ledger', $this->requestJson(1))->getStatusCode());
        self::assertSame(1, (int) $this->db->query('PRAGMA recursive_triggers')->fetchColumn());
        $original = $this->db->query('SELECT rowid, * FROM ledger_entries')->fetch();
        self::assertIsArray($original);
        $tail = "'e-yeongjong-fireworks-2025', '2026-09-29T09:00:00+09:00', 5, '{}', 'a', 'b', 'c'";
        $statements = [
            "UPDATE ledger_entries SET forecast_json = '{}' WHERE seq = 1",
            'DELETE FROM ledger_entries WHERE seq = 1',
            "REPLACE INTO ledger_entries VALUES (1, 'f-example-yeongjong-2', {$tail})",
            "INSERT OR REPLACE INTO ledger_entries VALUES (2, 'f-example-yeongjong-1', {$tail})",
            "INSERT INTO ledger_entries VALUES (1, 'f-example-yeongjong-2', {$tail})",
            "INSERT INTO ledger_entries VALUES (2, 'f-example-yeongjong-1', {$tail})",
            "INSERT OR REPLACE INTO ledger_entries (rowid, forecast_id, event_id, registered_at, lead_days, forecast_json, payload_hash, prev_hash, hash) VALUES (1, 'f-example-yeongjong-2', {$tail})",
            "INSERT INTO ledger_entries VALUES (1, 'f-example-yeongjong-2', {$tail}) ON CONFLICT(seq) DO UPDATE SET forecast_json = excluded.forecast_json",
        ];
        foreach ($statements as $sql) {
            $rejected = false;
            try {
                $this->db->exec($sql);
            } catch (PDOException $error) {
                $rejected = true;
                self::assertStringContainsString('ledger entry is immutable', $error->getMessage());
            }
            self::assertTrue($rejected, $sql);
            self::assertSame($original, $this->db->query('SELECT rowid, * FROM ledger_entries')->fetch());
        }
    }

    // 실제 행사 픽스처를 행사 API를 통해 저장한다
    private function createEvent(): void
    {
        $event = (string) file_get_contents(dirname(__DIR__, 3) . '/packages/contracts/fixtures/event/valid-yeongjong.json');
        self::assertSame(200, $this->request('POST', '/v1/events', $event)->getStatusCode());
    }

    // 예시 ID를 바꿔 같은 한국 행사에 서로 다른 예보 세 건을 등록한다
    private function requestJson(int $number): string
    {
        return json_encode([
            'forecastId' => "f-example-yeongjong-{$number}",
            'eventId' => 'e-yeongjong-fireworks-2025',
            'leadDays' => 5,
            'forecast' => [
                'dailyMeanP10' => 100 * $number,
                'dailyMeanP50' => 200 * $number,
                'dailyMeanP90' => 300 * $number,
                'level' => 2,
            ],
        ], JSON_THROW_ON_ERROR);
    }

    // JSON 본문을 Slim 요청으로 보내 실제 라우트 응답을 받는다
    private function request(string $method, string $path, string $json = ''): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, $path);
        $request->getBody()->write($json);
        return $this->app->handle($request);
    }

    // 검증 결과의 모든 필드를 배열로 비교한다
    private function body(ResponseInterface $response): mixed
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }
}
