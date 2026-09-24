<?php
// 행사별 발행 예보서 조회와 스냅샷 추가를 처리한다
declare(strict_types=1);

namespace CrowdCast\Records\Snapshots;

use CrowdCast\Records\Routes\JsonResponse;
use InvalidArgumentException;
use PDOException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// 발행 예보서의 계약 오류와 불변 충돌을 HTTP 상태로 변환한다
final class CollectionController
{
    public function __construct(private Service $service)
    {
    }

    // 행사별 스냅샷의 전체 문서를 배열로 반환한다
    /** @param array{id: string} $args */
    public function all(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        if (!$this->validId($args['id'])) {
            return JsonResponse::error($response, 400, 'invalid_event_id');
        }
        $reports = $this->service->all($args['id']);
        return $reports === null
            ? JsonResponse::error($response, 404, 'not_found')
            : JsonResponse::value($response, 200, $reports);
    }

    // 계약과 행사 소속을 확인한 발행 문서만 저장한다
    /** @param array{id: string} $args */
    public function create(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        if (!$this->validId($args['id'])) {
            return JsonResponse::error($response, 400, 'invalid_event_id');
        }
        try {
            $json = $this->service->create($args['id'], (string) $request->getBody());
            return $json === null
                ? JsonResponse::error($response, 404, 'not_found')
                : JsonResponse::raw($response, 200, $json);
        } catch (InvalidArgumentException) {
            return JsonResponse::error($response, 400, 'invalid_forecast_report');
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') {
                return JsonResponse::error($response, 409, 'snapshot_immutable');
            }
            throw $error;
        }
    }

    // 행사 경로에도 event 계약의 ID 패턴을 적용한다
    private function validId(string $id): bool
    {
        return preg_match('/^e-[a-z0-9][a-z0-9_.:-]{1,120}$/D', $id) === 1;
    }
}
