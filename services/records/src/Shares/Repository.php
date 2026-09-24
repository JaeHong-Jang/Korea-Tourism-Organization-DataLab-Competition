<?php
// 예보별 공유 토큰을 한 번 저장하고 토큰으로 예보를 찾는다
declare(strict_types=1);

namespace CrowdCast\Records\Shares;

use PDO;

// 예보 ID의 유일 키로 중복 요청에도 첫 토큰을 유지한다
final class Repository
{
    public function __construct(private PDO $db)
    {
    }

    // 이미 발행한 공유 토큰이 있으면 그대로 사용한다
    public function tokenForForecast(string $forecastId): ?string
    {
        $statement = $this->db->prepare('SELECT token FROM shares WHERE forecast_id = :forecast_id');
        $statement->execute(['forecast_id' => $forecastId]);
        $token = $statement->fetchColumn();
        return $token === false ? null : $token;
    }

    // 동시에 같은 예보를 공유해도 기존 토큰을 덮어쓰지 않는다
    public function createIfMissing(string $forecastId, string $token): string
    {
        $statement = $this->db->prepare(
            'INSERT INTO shares (forecast_id, token) VALUES (:forecast_id, :token) '
            . 'ON CONFLICT(forecast_id) DO NOTHING'
        );
        $statement->execute(['forecast_id' => $forecastId, 'token' => $token]);
        return $this->tokenForForecast($forecastId) ?? $token;
    }

    // 외부에 예보 ID를 드러내지 않고 토큰에서 발행본을 찾는다
    public function forecastForToken(string $token): ?string
    {
        $statement = $this->db->prepare('SELECT forecast_id FROM shares WHERE token = :token');
        $statement->execute(['token' => $token]);
        $forecastId = $statement->fetchColumn();
        return $forecastId === false ? null : $forecastId;
    }
}
