<?php
// 계획 수정 시각이 바뀐 경우 충돌을 HTTP 응답까지 전달한다
declare(strict_types=1);

namespace CrowdCast\Records\Plans;

use RuntimeException;

// 이전 화면의 수정 요청으로 최신 계획을 덮어쓰지 못하게 구별한다
final class PlanConflict extends RuntimeException
{
}
