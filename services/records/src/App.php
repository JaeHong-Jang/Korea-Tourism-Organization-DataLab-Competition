<?php
// 기록 서비스의 Slim 앱과 공통 오류 응답을 구성한다
declare(strict_types=1);

namespace CrowdCast\Records;

use CrowdCast\Records\Health\Controller as HealthController;
use DI\Container;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App as SlimApp;
use Slim\Exception\HttpException;
use Slim\Factory\AppFactory;
use Throwable;

// 상태 확인 라우트와 공통 JSON 오류 응답을 조립한다
final class App
{
    // 테스트와 HTTP 진입점이 같은 라우트 및 오류 처리 구성을 사용한다
    /** @return SlimApp<Container> */
    public static function create(): SlimApp
    {
        $container = new Container();
        $app = AppFactory::createFromContainer($container);

        // 상태 확인은 저장소 연결 없이 응답할 수 있게 둔다
        $app->get('/health', HealthController::class);
        $app->addRoutingMiddleware();

        // 존재하지 않는 경로도 API 소비자가 파싱 가능한 JSON으로 반환한다
        $errorMiddleware = $app->addErrorMiddleware(false, false, false);
        $errorMiddleware->setDefaultErrorHandler(
            function (
                ServerRequestInterface $request,
                Throwable $exception,
                bool $displayErrorDetails,
                bool $logErrors,
                bool $logErrorDetails
            ) use ($app): ResponseInterface {
                $status = $exception instanceof HttpException && $exception->getCode() >= 400
                    ? $exception->getCode()
                    : 500;
                $response = $app->getResponseFactory()->createResponse($status);
                $error = match ($status) {
                    404 => 'not_found',
                    405 => 'method_not_allowed',
                    default => 'internal_error',
                };
                $body = json_encode(
                    ['error' => $error],
                    JSON_THROW_ON_ERROR
                );
                $response->getBody()->write($body);
                return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
            }
        );

        return $app;
    }
}
