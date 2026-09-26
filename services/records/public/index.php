<?php
// PHP 내장 서버에서 기록 서비스의 HTTP 요청을 Slim 앱으로 전달한다
declare(strict_types=1);

use CrowdCast\Records\App;

require dirname(__DIR__) . '/vendor/autoload.php';

// 정적 자산이 없는 API는 모든 경로를 앱 라우터에서 판단한다
App::create()->run();
