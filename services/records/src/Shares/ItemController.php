<?php
// 공유 토큰에 연결된 발행 스냅샷 원문을 반환한다
declare(strict_types=1);

namespace CrowdCast\Records\Shares;

use CrowdCast\Records\Routes\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// 공유 주소는 조회만 제공하고 예보서를 변경할 경로가 없다
final class ItemController
{
    public function __construct(private Service $service)
    {
    }

    // 계약 범위 밖 토큰은 조회하지 않고 없는 토큰과 같이 취급한다
    /** @param array{token: string} $args */
    public function get(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        if (preg_match('/^sh-[A-Za-z0-9_-]{16,64}$/D', $args['token']) !== 1) {
            return JsonResponse::error($response, 404, 'not_found');
        }
        $json = $this->service->get($args['token']);
        return $json === null
            ? JsonResponse::error($response, 404, 'not_found')
            : JsonResponse::raw($response, 200, $json);
    }
}
