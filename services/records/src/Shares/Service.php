<?php
// 공유 요청을 검사하고 난수 토큰을 발행 스냅샷에 연결한다
declare(strict_types=1);

namespace CrowdCast\Records\Shares;

use CrowdCast\Records\Snapshots\Service as SnapshotService;
use InvalidArgumentException;
use JsonException;
use stdClass;

// 같은 예보에는 같은 공유 토큰을 반환하고 토큰은 기록하지 않는다
final class Service
{
    public function __construct(private Repository $repository, private SnapshotService $snapshots)
    {
    }

    // 계약의 단일 forecastId 요청만 받아 원문에 없는 필드를 거부한다
    public function create(string $json): ?string
    {
        try {
            $request = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new InvalidArgumentException('invalid_share');
        }
        if (
            !$request instanceof stdClass
            || array_keys(get_object_vars($request)) !== ['forecastId']
            || !is_string($request->forecastId)
            || preg_match('/^f-[a-z0-9][a-z0-9_.:-]{1,120}$/D', $request->forecastId) !== 1
        ) {
            throw new InvalidArgumentException('invalid_share');
        }
        if ($this->snapshots->getByForecastId($request->forecastId) === null) {
            return null;
        }
        $existing = $this->repository->tokenForForecast($request->forecastId);
        if ($existing !== null) {
            return $existing;
        }

        // 24개의 암호학적 난수 바이트를 URL 안전한 32자로 바꾼다
        $token = 'sh-' . rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
        return $this->repository->createIfMissing($request->forecastId, $token);
    }

    // 토큰으로 찾은 발행 문서도 스냅샷 계약 검사를 거친다
    public function get(string $token): ?string
    {
        $forecastId = $this->repository->forecastForToken($token);
        return $forecastId === null ? null : $this->snapshots->getByForecastId($forecastId);
    }
}
