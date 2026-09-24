<?php
// 사전 등록 원장 목록과 새 항목의 HTTP 응답을 처리한다
declare(strict_types=1);

namespace CrowdCast\Records\Ledger;

use CrowdCast\Records\Routes\JsonResponse;
use InvalidArgumentException;
use PDOException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// 계약 오류·없는 행사·중복 등록을 구분해 반환한다
final class CollectionController
{
    // 컬렉션 요청에 같은 원장 서비스를 사용한다
    public function __construct(private Service $service)
    {
    }

    // 공개 원장의 모든 항목을 순번대로 돌려준다
    public function all(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponse::value($response, 200, $this->service->all());
    }

    // 검증된 새 항목만 200으로 반환하고 기존 예보 ID는 409로 거부한다
    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        try {
            $entry = $this->service->create((string) $request->getBody());
            return $entry === null
                ? JsonResponse::error($response, 404, 'not_found')
                : JsonResponse::value($response, 200, $entry);
        } catch (InvalidArgumentException) {
            return JsonResponse::error($response, 400, 'invalid_ledger_entry');
        } catch (PDOException $error) {
            if ($error->getCode() === '23000' || str_contains($error->getMessage(), 'ledger entry is immutable')) {
                return JsonResponse::error($response, 409, 'ledger_immutable');
            }
            throw $error;
        }
    }
}
