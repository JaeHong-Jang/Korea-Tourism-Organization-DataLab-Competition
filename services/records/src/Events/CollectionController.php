<?php
// 저장한 행사 목록 조회와 새 행사 저장 요청을 처리한다
declare(strict_types=1);

namespace CrowdCast\Records\Events;

use CrowdCast\Records\Routes\JsonResponse;
use InvalidArgumentException;
use PDOException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// 컬렉션 요청에서 계약 오류와 ID 중복을 HTTP 상태로 변환한다
final class CollectionController
{
    public function __construct(private Service $service)
    {
    }

    // 저장된 활성 행사만 계약을 통과한 JSON 배열로 반환한다
    public function all(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponse::value($response, 200, $this->service->all());
    }

    // 본문을 검증하고 저장한 원문을 반환한다
    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $json = (string) $request->getBody();
        try {
            return JsonResponse::raw($response, 200, $this->service->create($json));
        } catch (InvalidArgumentException) {
            return JsonResponse::error($response, 400, 'invalid_event');
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') {
                return JsonResponse::error($response, 409, 'event_exists');
            }
            throw $error;
        }
    }
}
