-- 행사 실측을 입력 순서대로 보존하고 예보별 공유 토큰을 연결한다
CREATE TABLE actuals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    actual_json TEXT NOT NULL CHECK (json_valid(actual_json)),
    recorded_at TEXT NOT NULL
);
CREATE INDEX actuals_event_latest ON actuals(event_id, id DESC);

-- 실측은 수정과 삭제 없이 새 행을 추가해 정정 이력을 남긴다
CREATE TRIGGER actuals_no_update BEFORE UPDATE ON actuals
BEGIN
    SELECT RAISE(ABORT, 'actual is immutable');
END;
CREATE TRIGGER actuals_no_delete BEFORE DELETE ON actuals
BEGIN
    SELECT RAISE(ABORT, 'actual is immutable');
END;
CREATE TRIGGER actuals_no_reinsert BEFORE INSERT ON actuals
WHEN NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM actuals WHERE id = NEW.id)
BEGIN
    SELECT RAISE(ABORT, 'actual is immutable');
END;

-- 한 예보에 공유 주소를 하나만 두고 발행 스냅샷을 계속 참조한다
CREATE TABLE shares (
    forecast_id TEXT PRIMARY KEY REFERENCES forecast_snapshots(forecast_id) ON DELETE RESTRICT,
    token TEXT NOT NULL UNIQUE CHECK (token GLOB 'sh-*')
);
