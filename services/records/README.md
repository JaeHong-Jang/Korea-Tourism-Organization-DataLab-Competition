# services/records — PHP 기록·문서 서비스 (레인 L5, Codex gpt-6-sol)

- 스택: PHP 8.5 + Slim 4, PHP-DI, PDO SQLite, PHPWord(docx), opis/json-schema, PHPUnit·PHPStan
- 역할: 내 행사 CRUD, 예보 스냅샷(불변), 계획 초안 CRUD·docx 내보내기, 사전 등록 원장(해시 체인), 실측 입력, 공유 링크
- 설계: `docs/plan/05_기술_아키텍처.md` §2·§4
- 폴더: `public/index.php` `src/{Events,Snapshots,Plans,Ledger,Actuals,Shares,Support}/` `migrations/` `tests/`
- 코드 규칙: `AGENTS.md` §5
