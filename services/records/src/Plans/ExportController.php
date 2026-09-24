<?php
// 저장된 계획을 PHPWord docx 응답으로 내보낸다
declare(strict_types=1);

namespace CrowdCast\Records\Plans;

use CrowdCast\Records\Routes\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// 이력과 분리된 현재 계획 및 불변 스냅샷으로 문서를 만든다
final class ExportController
{
    // 저장본과 발행 스냅샷을 문서 렌더러에 전달한다
    public function __construct(private Service $service, private Exporter $exporter)
    {
    }

    // 다운로드 이름은 계약의 계획 ID만 허용한다
    /** @param array{id: string} $args */
    public function get(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        if (preg_match('/^plan-[a-z0-9][a-z0-9_.:-]{1,120}$/D', $args['id']) !== 1) {
            return JsonResponse::error($response, 400, 'invalid_plan_id');
        }
        $document = $this->service->document($args['id']);
        if ($document === null) {
            return JsonResponse::error($response, 404, 'not_found');
        }
        $response->getBody()->write($this->exporter->render($document[0], $document[1]));
        return $response
            ->withHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            ->withHeader('Content-Disposition', 'attachment; filename="' . $args['id'] . '.docx"');
    }
}
