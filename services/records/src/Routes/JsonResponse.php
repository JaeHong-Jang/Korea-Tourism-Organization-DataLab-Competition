<?php
// 기록 API의 JSON 성공·오류 응답을 같은 헤더로 직렬화한다
declare(strict_types=1);

namespace CrowdCast\Records\Routes;

use Psr\Http\Message\ResponseInterface;

// 컨트롤러가 상태 코드와 본문을 일관되게 반환하게 한다
final class JsonResponse
{
    // 이미 계약 검증된 JSON 문자열을 그대로 응답한다
    public static function raw(ResponseInterface $response, int $status, string $json): ResponseInterface
    {
        $response->getBody()->write($json);
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    // 목록과 오류 본문을 JSON으로 직렬화한다
    public static function value(ResponseInterface $response, int $status, mixed $value): ResponseInterface
    {
        return self::raw($response, $status, json_encode($value, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION));
    }

    // 오류 코드만 담아 클라이언트가 상태를 구별하게 한다
    public static function error(ResponseInterface $response, int $status, string $error): ResponseInterface
    {
        return self::value($response, $status, ['error' => $error]);
    }
}
