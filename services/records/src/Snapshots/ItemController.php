<?php
// 예보 ID에 해당하는 발행 스냅샷 원문을 반환한다
declare(strict_types=1);

namespace CrowdCast\Records\Snapshots;

use CrowdCast\Records\Routes\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// 발행본은 행사 삭제 표시와 관계없이 직접 조회할 수 있다
final class ItemController
{
    public function __construct(private Service $service)
    {
    }

    // 계약의 예보 ID 패턴을 검사하고 저장된 문서를 그대로 보낸다
    /** @param array{forecastId: string} $args */
    public function get(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        if (preg_match('/^f-[a-z0-9][a-z0-9_.:-]{1,120}$/D', $args['forecastId']) !== 1) {
            return JsonResponse::error($response, 400, 'invalid_forecast_id');
        }
        $json = $this->service->getByForecastId($args['forecastId']);
        return $json === null
            ? JsonResponse::error($response, 404, 'not_found')
            : JsonResponse::raw($response, 200, $json);
    }
}
