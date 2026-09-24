<?php
// 기록 서비스가 응답 가능한지 알려 주는 상태 확인 라우트다
declare(strict_types=1);

namespace CrowdCast\Records\Health;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// 서비스 상태와 버전을 health 계약의 응답으로 제공한다
final class Controller
{
    // 서비스 상태와 API 버전을 계약의 JSON 형태로 반환한다
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $response->getBody()->write(json_encode(
            ['status' => 'ok', 'version' => '0.1.0'],
            JSON_THROW_ON_ERROR
        ));
        return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}
