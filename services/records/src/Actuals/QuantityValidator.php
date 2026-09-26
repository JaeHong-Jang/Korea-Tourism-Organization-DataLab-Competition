<?php
// 공통 계약의 quantity 정의로 행사 실측 수치를 검사한다
declare(strict_types=1);

namespace CrowdCast\Records\Actuals;

use Opis\JsonSchema\Validator;

// 공통 스키마의 참조 해석을 기존 계약 검증기와 같은 경로로 설정한다
final class QuantityValidator
{
    private Validator $validator;

    // 공통 스키마 참조를 계약 경로로 등록한 검증기를 만든다
    public function __construct()
    {
        $this->validator = new Validator();
        $this->validator->resolver()->registerPrefix(
            'https://crowdcast.local/schemas/',
            dirname(__DIR__, 4) . '/packages/contracts/schemas/'
        );
    }

    // 단위·시간 단위·공간 범위·값 종류를 포함한 계약 전체를 적용한다
    public function isValid(mixed $quantity): bool
    {
        return $this->validator->validate(
            $quantity,
            'https://crowdcast.local/schemas/common.schema.json#/$defs/quantity'
        )->isValid();
    }
}
