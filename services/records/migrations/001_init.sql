-- 행사·발행 스냅샷·계획 초안·사전 등록 원장의 기본 저장 구조를 만든다
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    event_json TEXT NOT NULL CHECK (json_valid(event_json)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 발행된 예보서 전체를 원문 JSON으로 보존하고 행사에 연결한다
CREATE TABLE forecast_snapshots (
    forecast_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    published_at TEXT NOT NULL,
    report_json TEXT NOT NULL CHECK (json_valid(report_json))
);
CREATE INDEX forecast_snapshots_event_id ON forecast_snapshots(event_id);

-- 스냅샷의 모든 열은 최초 삽입 뒤 변경할 수 없다
CREATE TRIGGER forecast_snapshots_no_update
BEFORE UPDATE ON forecast_snapshots
BEGIN
    SELECT RAISE(ABORT, 'forecast snapshot is immutable');
END;

-- 스냅샷 삭제를 막아 참조 가능한 발행 기록을 유지한다
CREATE TRIGGER forecast_snapshots_no_delete
BEFORE DELETE ON forecast_snapshots
BEGIN
    SELECT RAISE(ABORT, 'forecast snapshot is immutable');
END;

-- 계획 초안은 발행 스냅샷에 연결하고 편집 시각을 따로 기록한다
CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    forecast_id TEXT NOT NULL REFERENCES forecast_snapshots(forecast_id) ON DELETE RESTRICT,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    watermark TEXT NOT NULL
);
CREATE INDEX plans_event_id ON plans(event_id);

-- 초안의 아홉 섹션은 배열 순서와 계약 필드를 그대로 보관한다
CREATE TABLE plan_sections (
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    section_key TEXT NOT NULL,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    claim_ids_json TEXT NOT NULL CHECK (json_valid(claim_ids_json)),
    body TEXT NOT NULL,
    locked_fields_json TEXT NOT NULL CHECK (json_valid(locked_fields_json)),
    PRIMARY KEY (plan_id, section_key),
    UNIQUE (plan_id, position)
);

-- 해시 체인을 검증할 수 있도록 원장 본문과 세 해시를 보존한다
CREATE TABLE ledger_entries (
    seq INTEGER PRIMARY KEY,
    forecast_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    registered_at TEXT NOT NULL,
    lead_days INTEGER NOT NULL,
    forecast_json TEXT NOT NULL CHECK (json_valid(forecast_json)),
    payload_hash TEXT NOT NULL,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL
);
