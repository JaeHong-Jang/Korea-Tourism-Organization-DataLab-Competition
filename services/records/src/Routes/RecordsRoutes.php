<?php
// 행사와 발행 스냅샷의 HTTP 경로를 Slim 앱에 등록한다
declare(strict_types=1);

namespace CrowdCast\Records\Routes;

use CrowdCast\Records\Events\CollectionController as EventCollection;
use CrowdCast\Records\Events\ItemController as EventItem;
use CrowdCast\Records\Events\Repository as EventRepository;
use CrowdCast\Records\Events\Service as EventService;
use CrowdCast\Records\Snapshots\CollectionController as SnapshotCollection;
use CrowdCast\Records\Snapshots\MutationController as SnapshotMutation;
use CrowdCast\Records\Snapshots\Repository as SnapshotRepository;
use CrowdCast\Records\Snapshots\Service as SnapshotService;
use CrowdCast\Records\Support\ContractValidator;
use CrowdCast\Records\Support\Db;
use CrowdCast\Records\Support\Migrator;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;

// DB 연결을 첫 기록 요청까지 미뤄 health 라우트를 독립적으로 유지한다
final class RecordsRoutes
{
    // 모든 기록 라우트는 같은 연결과 계약 검증기를 사용한다
    /** @param App<\DI\Container> $app */
    public static function register(App $app, ?PDO $db = null): void
    {
        $migrated = false;
        $database = static function () use (&$db, &$migrated): PDO {
            $db ??= Db::connect();
            if (!$migrated) {
                Migrator::run($db);
                $migrated = true;
            }
            return $db;
        };

        // 각 요청에서 저장소를 열고 같은 계약 스키마를 주입한다
        $events = static fn(): EventService => new EventService(
            new EventRepository($database()),
            new ContractValidator()
        );
        $snapshots = static fn(): SnapshotService => new SnapshotService(
            new SnapshotRepository($database()),
            new EventRepository($database()),
            new ContractValidator()
        );

        // 행사 컬렉션은 조회와 생성만 허용한다
        $app->get('/v1/events', function (ServerRequestInterface $request, ResponseInterface $response) use ($events): ResponseInterface {
            return (new EventCollection($events()))->all($request, $response);
        });
        $app->post('/v1/events', function (ServerRequestInterface $request, ResponseInterface $response) use ($events): ResponseInterface {
            return (new EventCollection($events()))->create($request, $response);
        });

        // 개별 행사는 원문 조회와 논리 삭제를 제공한다
        $app->get('/v1/events/{id}', function (ServerRequestInterface $request, ResponseInterface $response, array $args) use ($events): ResponseInterface {
            return (new EventItem($events()))->get($request, $response, $args);
        });
        $app->delete('/v1/events/{id}', function (ServerRequestInterface $request, ResponseInterface $response, array $args) use ($events): ResponseInterface {
            return (new EventItem($events()))->delete($request, $response, $args);
        });

        // 발행 스냅샷은 조회와 최초 저장만 제공한다
        $app->get('/v1/events/{id}/snapshots', function (ServerRequestInterface $request, ResponseInterface $response, array $args) use ($snapshots): ResponseInterface {
            return (new SnapshotCollection($snapshots()))->all($request, $response, $args);
        });
        $app->post('/v1/events/{id}/snapshots', function (ServerRequestInterface $request, ResponseInterface $response, array $args) use ($snapshots): ResponseInterface {
            return (new SnapshotCollection($snapshots()))->create($request, $response, $args);
        });

        // 컬렉션과 개별 스냅샷의 수정·삭제는 409로 명시한다
        foreach (['/v1/events/{id}/snapshots', '/v1/events/{id}/snapshots/{forecastId}'] as $path) {
            $app->map(['PUT', 'PATCH', 'DELETE'], $path, function (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
                return (new SnapshotMutation())->reject($request, $response);
            });
        }
    }
}
