<?php
// 계약 픽스처가 요청·응답 공용 검증기에서 올바르게 판정되는지 검사한다
declare(strict_types=1);

namespace CrowdCast\Records\Tests;

use CrowdCast\Records\Support\ContractValidator;
use PHPUnit\Framework\TestCase;

// 계약 픽스처의 정상과 오류 사례를 동일한 검증기로 확인한다
final class ContractValidatorTest extends TestCase
{
    // 정상 행사와 발행 예보서는 계약 스키마를 통과한다
    public function testValidFixturesPass(): void
    {
        $validator = new ContractValidator();
        self::assertTrue($validator->isValid('event', $this->fixture('event/valid-yeongjong.json')));
        self::assertTrue($validator->isValid(
            'forecast-report',
            $this->fixture('forecast-report/valid-yeongjong.json')
        ));
    }

    // 잘못된 예보서는 참조 스키마와 발행 상태 검증에서 거부된다
    public function testInvalidFixturesFail(): void
    {
        $validator = new ContractValidator();
        self::assertFalse($validator->isValid(
            'forecast-report',
            $this->fixture('forecast-report/invalid-unpublished-claim.json')
        ));
        self::assertFalse($validator->isValid(
            'forecast',
            $this->fixture('forecast/invalid-missing-unit.json')
        ));
    }

    // 저장소의 계약 픽스처를 JSON 객체로 읽어 Opis에 넘긴다
    private function fixture(string $name): mixed
    {
        $path = dirname(__DIR__, 3) . '/packages/contracts/fixtures/' . $name;
        return json_decode((string) file_get_contents($path), false, 512, JSON_THROW_ON_ERROR);
    }
}
