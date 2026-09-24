<?php
// 예보 공유 토큰의 생성 요청을 처리한다
declare(strict_types=1);

namespace CrowdCast\Records\Shares;

use CrowdCast\Records\Routes\JsonResponse;
use InvalidArgumentException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// 발행본이 없으면 공유 토큰도 만들지 않는다
final class CollectionController
{
    public function __construct(private Service $service)
    {
    }

    // 토큰 값만 응답하고 서버 로그에는 적지 않는다
    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        try {
            $token = $this->service->create((string) $request->getBody());
            return $token === null
                ? JsonResponse::error($response, 404, 'not_found')
                : JsonResponse::value($response, 200, ['token' => $token]);
        } catch (InvalidArgumentException) {
            return JsonResponse::error($response, 400, 'invalid_share');
        }
    }
}
