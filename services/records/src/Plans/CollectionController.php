<?php
// 계획 초안 생성 요청을 검증하고 충돌·본문 오류를 HTTP로 반환한다
declare(strict_types=1);

namespace CrowdCast\Records\Plans;

use CrowdCast\Records\Routes\JsonResponse;
use InvalidArgumentException;
use PDOException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// 초안 생성의 422 메시지에 실패 규칙을 포함한다
final class CollectionController
{
    // 생성 요청에 계약 검증과 중복 ID 처리를 함께 적용한다
    public function __construct(private Service $service)
    {
    }

    // 계약과 스냅샷 확인을 통과한 계획만 새 ID로 저장한다
    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        try {
            return JsonResponse::value($response, 200, $this->service->create((string) $request->getBody()));
        } catch (InvalidArgumentException $error) {
            return JsonResponse::value($response, 422, ['error' => 'invalid_plan', 'message' => $error->getMessage()]);
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') {
                return JsonResponse::error($response, 409, 'plan_exists');
            }
            throw $error;
        }
    }
}
