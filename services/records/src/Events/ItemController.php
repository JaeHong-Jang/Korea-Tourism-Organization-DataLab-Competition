<?php
// 개별 행사 조회와 논리 삭제 요청을 처리한다
declare(strict_types=1);

namespace CrowdCast\Records\Events;

use CrowdCast\Records\Routes\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// 행사 ID를 검사하고 삭제된 행사는 보이지 않게 한다
final class ItemController
{
    public function __construct(private Service $service)
    {
    }

    // 경로 ID가 계약 형식이면 행사 원문을 조회한다
    /** @param array{id: string} $args */
    public function get(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        if (!$this->validId($args['id'])) {
            return JsonResponse::error($response, 400, 'invalid_event_id');
        }
        $json = $this->service->get($args['id']);
        return $json === null
            ? JsonResponse::error($response, 404, 'not_found')
            : JsonResponse::raw($response, 200, $json);
    }

    // 삭제는 발행 기록의 원문을 건드리지 않고 목록에서만 숨긴다
    /** @param array{id: string} $args */
    public function delete(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        if (!$this->validId($args['id'])) {
            return JsonResponse::error($response, 400, 'invalid_event_id');
        }
        return $this->service->delete($args['id'])
            ? $response->withStatus(204)
            : JsonResponse::error($response, 404, 'not_found');
    }

    // event 계약의 ID 패턴을 경로에도 적용한다
    private function validId(string $id): bool
    {
        return preg_match('/^e-[a-z0-9][a-z0-9_.:-]{1,120}$/D', $id) === 1;
    }
}
