<?php
// 발행 스냅샷의 수정·삭제 요청을 충돌로 거부한다
declare(strict_types=1);

namespace CrowdCast\Records\Snapshots;

use CrowdCast\Records\Routes\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// 불변 문서에 쓰기 메서드가 닿으면 항상 충돌을 알린다
final class MutationController
{
    // PUT·PATCH·DELETE는 스냅샷에 적용할 수 없다
    public function reject(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponse::error($response, 409, 'snapshot_immutable');
    }
}
