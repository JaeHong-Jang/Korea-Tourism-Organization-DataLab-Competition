<?php
// 요청과 응답 객체를 계약의 JSON Schema 2020-12로 검증한다
declare(strict_types=1);

namespace CrowdCast\Records\Support;

use InvalidArgumentException;
use Opis\JsonSchema\Validator;

// 계약 스키마의 참조를 해석하고 요청·응답 데이터를 검증한다
final class ContractValidator
{
    private Validator $validator;
    private string $schemaDirectory;

    // 계약의 $id 접두어를 레포의 스키마 폴더에 연결한다
    public function __construct(?string $schemaDirectory = null)
    {
        $this->schemaDirectory = $schemaDirectory ?? dirname(__DIR__, 4) . '/packages/contracts/schemas';
        $this->validator = new Validator();
        $this->validator->resolver()->registerPrefix(
            'https://crowdcast.local/schemas/',
            $this->schemaDirectory . '/'
        );
        $this->validator->setMaxErrors(1);
    }

    // 계약 이름을 검사한 뒤 Opis가 참조 스키마까지 검증하게 한다
    public function isValid(string $schemaName, mixed $data): bool
    {
        if (
            preg_match('/^[a-z][a-z0-9-]*$/D', $schemaName) !== 1
            || !is_file($this->schemaDirectory . "/{$schemaName}.schema.json")
        ) {
            throw new InvalidArgumentException("알 수 없는 계약 스키마: {$schemaName}");
        }

        return $this->validator->validate(
            $data,
            "https://crowdcast.local/schemas/{$schemaName}.schema.json"
        )->isValid();
    }
}
