<?php
// 기록 서비스가 응답 가능한지 알려 주는 상태 확인 라우트다
declare(strict_types=1);

namespace CrowdCast\Records\Health;

use Opis\JsonSchema\Validator;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use RuntimeException;

// 서비스 상태와 버전을 health 계약의 응답으로 제공한다
final class Controller
{
    // 서비스 상태와 API 버전을 계약의 JSON 형태로 반환한다
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $health = (object) ['status' => 'ok', 'version' => '0.1.0'];
        // 계약 정본의 /health 200 스키마를 읽어 반환 직전에 검사한다
        $schema = $this->healthSchema();
        if (!(new Validator())->validate($health, $schema)->isValid()) {
            throw new RuntimeException('health 응답이 OpenAPI 계약을 위반합니다');
        }
        $response->getBody()->write(json_encode($health, JSON_THROW_ON_ERROR));
        return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    // 작은 OpenAPI health 스키마의 객체·필수 필드·속성 제약을 원문에서 읽는다
    private function healthSchema(): object
    {
        $path = dirname(__DIR__, 4) . '/packages/contracts/openapi/records.yaml';
        $yaml = file_get_contents($path);
        if ($yaml === false || preg_match('/(?ms)^  \/health:\n(.*?)(?=^  \/|\z)/', $yaml, $block) !== 1) {
            throw new RuntimeException('health OpenAPI 계약을 읽을 수 없습니다');
        }
        if (
            preg_match('/^                type: (\w+)$/m', $block[1], $type) !== 1
            || preg_match('/(?m)^                required:\n((?:                  - \w+\n)+)/', $block[1], $required) !== 1
            || preg_match_all('/(?m)^                  (\w+):\n                    (type|const): (\w+)$/', $block[1], $fields, PREG_SET_ORDER) < 1
        ) {
            throw new RuntimeException('health OpenAPI 스키마 형식을 해석할 수 없습니다');
        }

        // YAML의 현재 health 제약을 Opis가 읽는 JSON Schema 객체로 옮긴다
        preg_match_all('/- (\w+)/', $required[1], $names);
        $properties = [];
        foreach ($fields as $field) {
            $properties[$field[1]] = [$field[2] => $field[3]];
        }
        return json_decode(json_encode([
            'type' => $type[1],
            'required' => $names[1],
            'properties' => $properties,
        ], JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR);
    }
}
