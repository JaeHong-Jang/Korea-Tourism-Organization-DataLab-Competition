-- 계획 수정 전 본문 전체를 순번별로 남겨 덮어쓰기로 인한 이력 손실을 막는다
CREATE TABLE plan_revisions (
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    revision INTEGER NOT NULL,
    previous_plan_json TEXT NOT NULL CHECK (json_valid(previous_plan_json)),
    revised_at TEXT NOT NULL,
    PRIMARY KEY (plan_id, revision)
);

-- 수정 이력의 모든 열은 한 번 기록하면 바꿀 수 없다
CREATE TRIGGER plan_revisions_no_update
BEFORE UPDATE ON plan_revisions
BEGIN
    SELECT RAISE(ABORT, 'plan revision is immutable');
END;

-- 직접 삭제와 REPLACE의 암묵적 삭제를 막는다
CREATE TRIGGER plan_revisions_no_delete
BEFORE DELETE ON plan_revisions
BEGIN
    SELECT RAISE(ABORT, 'plan revision is immutable');
END;

-- 복합 키와 rowid 충돌을 삽입 전에 모두 거부한다
CREATE TRIGGER plan_revisions_no_reinsert
BEFORE INSERT ON plan_revisions
WHEN EXISTS (
    SELECT 1 FROM plan_revisions
    WHERE (plan_id = NEW.plan_id AND revision = NEW.revision) OR rowid = NEW.rowid
)
BEGIN
    SELECT RAISE(ABORT, 'plan revision is immutable');
END;
