<?php
// 행사 실측 추가 요청의 계약 오류를 HTTP 응답으로 바꾼다
declare(strict_types=1);

namespace CrowdCast\Records\Actuals;

use CrowdCast\Records\Routes\JsonResponse;
use InvalidArgumentException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// 잘못된 수치나 없는 행사에는 저장 없이 422를 돌려준다
final class CollectionController
{
    public function __construct(private Service $service)
    {
    }

    // 검증한 실측을 한 행 추가하고 서버 기록 시각을 포함해 반환한다
    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        try {
            return JsonResponse::value($response, 200, $this->service->create((string) $request->getBody()));
        } catch (InvalidArgumentException $error) {
            return JsonResponse::error($response, 422, $error->getMessage());
        }
    }
}
