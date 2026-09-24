-- 계획 수정 전 본문 전체를 순번별로 남겨 덮어쓰기로 인한 이력 손실을 막는다
CREATE TABLE plan_revisions (
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    revision INTEGER NOT NULL,
    previous_plan_json TEXT NOT NULL CHECK (json_valid(previous_plan_json)),
    revised_at TEXT NOT NULL,
    PRIMARY KEY (plan_id, revision)
);
