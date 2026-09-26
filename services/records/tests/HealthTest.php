<?php
// 상태 확인과 없는 경로의 JSON 응답을 계약 형태로 검사한다
declare(strict_types=1);

namespace CrowdCast\Records\Tests;

use CrowdCast\Records\App;
use Opis\JsonSchema\Validator;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

// 상태 확인과 오류 응답의 계약을 HTTP 수준에서 확인한다
final class HealthTest extends TestCase
{
    // OpenAPI의 health 응답 필드와 값을 실제 Slim 응답에 대조한다
    public function testHealthResponseMatchesContract(): void
    {
        $request = (new ServerRequestFactory())->createServerRequest('GET', '/health');
        $response = App::create()->handle($request);
        $body = json_decode((string) $response->getBody(), false, 512, JSON_THROW_ON_ERROR);

        // OpenAPI /health의 200 응답 스키마를 그대로 확인한다
        $schema = json_decode((string) json_encode([
            'type' => 'object',
            'required' => ['status', 'version'],
            'properties' => [
                'status' => ['const' => 'ok'],
                'version' => ['type' => 'string'],
            ],
        ], JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR);

        // HTTP 상태와 본문이 health 계약에 맞는지 대조한다
        self::assertSame(200, $response->getStatusCode());
        self::assertSame('application/json; charset=utf-8', $response->getHeaderLine('Content-Type'));
        self::assertTrue((new Validator())->validate($body, $schema)->isValid());
        self::assertSame('0.1.0', $body->version);
    }

    // 알 수 없는 경로의 404도 JSON 본문을 가져야 한다
    public function testUnknownPathReturnsJson404(): void
    {
        $request = (new ServerRequestFactory())->createServerRequest('GET', '/missing');
        $response = App::create()->handle($request);

        // 없는 경로의 상태와 오류 본문을 함께 확인한다
        self::assertSame(404, $response->getStatusCode());
        self::assertSame('application/json; charset=utf-8', $response->getHeaderLine('Content-Type'));
        self::assertSame(['error' => 'not_found'], json_decode(
            (string) $response->getBody(),
            true,
            512,
            JSON_THROW_ON_ERROR
        ));
    }
}
