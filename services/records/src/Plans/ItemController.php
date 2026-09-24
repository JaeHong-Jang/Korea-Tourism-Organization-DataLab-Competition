<?php
// 저장된 계획의 조회와 수정 요청을 처리한다
declare(strict_types=1);

namespace CrowdCast\Records\Plans;

use CrowdCast\Records\Routes\JsonResponse;
use InvalidArgumentException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// 계획 ID를 확인하고 저장·조회 결과를 같은 계약 객체로 반환한다
final class ItemController
{
    // 조회와 수정에 같은 계획 서비스를 사용한다
    public function __construct(private Service $service)
    {
    }

    // 없는 계획과 잘못된 ID를 구별해 조회한다
    /** @param array{id: string} $args */
    public function get(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        if (!$this->validId($args['id'])) {
            return JsonResponse::error($response, 400, 'invalid_plan_id');
        }
        $plan = $this->service->get($args['id']);
        return $plan === null
            ? JsonResponse::error($response, 404, 'not_found')
            : JsonResponse::value($response, 200, $plan);
    }

    // 이전 본문을 이력에 남긴 뒤 최신 계획을 반환한다
    /** @param array{id: string} $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        if (!$this->validId($args['id'])) {
            return JsonResponse::error($response, 400, 'invalid_plan_id');
        }
        try {
            $plan = $this->service->update($args['id'], (string) $request->getBody());
            return $plan === null
                ? JsonResponse::error($response, 404, 'not_found')
                : JsonResponse::value($response, 200, $plan);
        } catch (InvalidArgumentException $error) {
            return JsonResponse::value($response, 422, ['error' => 'invalid_plan', 'message' => $error->getMessage()]);
        } catch (PlanConflict $error) {
            return JsonResponse::value($response, 409, ['error' => 'plan_conflict', 'message' => $error->getMessage()]);
        }
    }

    // 계약 plan의 ID 패턴을 경로에도 적용한다
    private function validId(string $id): bool
    {
        return preg_match('/^plan-[a-z0-9][a-z0-9_.:-]{1,120}$/D', $id) === 1;
    }
}
