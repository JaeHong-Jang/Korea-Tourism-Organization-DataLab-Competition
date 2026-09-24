<?php
// 계약 픽스처를 PHP(opis/json-schema, draft 2020-12)로 검증하고 {픽스처: 통과 여부} JSON을 출력한다
declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

use Opis\JsonSchema\Validator;

$root = dirname(__DIR__, 2);

// 스키마 $id 접두어를 schemas 폴더에 연결해 파일 사이 $ref를 풀 수 있게 한다
$validator = new Validator();
$validator->resolver()->registerPrefix('https://crowdcast.local/schemas/', $root . '/schemas/');
$validator->setMaxErrors(1);

// 픽스처 폴더 이름 = 스키마 이름으로 짝지어 검증한다
$results = [];
$files = glob($root . '/fixtures/*/*.json');
sort($files);
foreach ($files as $file) {
    $schemaName = basename(dirname($file));
    $data = json_decode((string) file_get_contents($file), false, 512, JSON_THROW_ON_ERROR);
    $result = $validator->validate($data, "https://crowdcast.local/schemas/{$schemaName}.schema.json");
    $results[$schemaName . '/' . basename($file)] = $result->isValid();
}

echo json_encode($results, JSON_UNESCAPED_UNICODE);
