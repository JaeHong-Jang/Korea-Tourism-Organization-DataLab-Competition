<?php
// 기록 서비스가 응답 가능한지 알려 주는 상태 확인 라우트다
declare(strict_types=1);

namespace CrowdCast\Records\Health;

use Opis\JsonSchema\Validator;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use RuntimeException;

// 서비스 상태와 버전을 health 계약의 응답으로 제공한다
final class Controller
{
    // 서비스 상태와 API 버전을 계약의 JSON 형태로 반환한다
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $health = (object) ['status' => 'ok', 'version' => '0.1.0'];
        // records OpenAPI /health 200 응답 스키마로 반환 직전에 검사한다
        $schema = json_decode(json_encode([
            'type' => 'object',
            'required' => ['status', 'version'],
            'properties' => [
                'status' => ['const' => 'ok'],
                'version' => ['type' => 'string'],
            ],
        ], JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR);
        if (!(new Validator())->validate($health, $schema)->isValid()) {
            throw new RuntimeException('health 응답이 OpenAPI 계약을 위반합니다');
        }
        $response->getBody()->write(json_encode($health, JSON_THROW_ON_ERROR));
        return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}
