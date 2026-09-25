-- 계획 초안 섹션의 작성자 메모(근거 없음)를 발행 문장과 따로 보관한다(T-408)
CREATE TABLE IF NOT EXISTS plan_section_notes (
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    section_key TEXT NOT NULL,
    notes TEXT NOT NULL,
    PRIMARY KEY (plan_id, section_key)
);
