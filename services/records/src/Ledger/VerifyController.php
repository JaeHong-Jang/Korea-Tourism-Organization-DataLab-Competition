<?php
// 저장된 사전 등록 원장 전체의 해시 검증 결과를 HTTP로 반환한다
declare(strict_types=1);

namespace CrowdCast\Records\Ledger;

use CrowdCast\Records\Routes\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// 첫 변조 위치와 검사한 행 수를 공개한다
final class VerifyController
{
    // 검증 요청에서 저장본을 다시 읽을 원장 서비스를 받는다
    public function __construct(private Service $service)
    {
    }

    // 저장본을 다시 계산한 결과만 응답에 담는다
    public function get(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponse::value($response, 200, $this->service->verify());
    }
}
