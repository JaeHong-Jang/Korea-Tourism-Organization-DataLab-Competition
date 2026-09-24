-- 기존 005 적용 DB에도 수정 이력의 UPDATE·DELETE·REPLACE 방지 규칙을 설치한다
CREATE TRIGGER IF NOT EXISTS plan_revisions_no_update
BEFORE UPDATE ON plan_revisions
BEGIN
    SELECT RAISE(ABORT, 'plan revision is immutable');
END;

-- 직접 삭제와 REPLACE의 암묵적 삭제를 막는다
CREATE TRIGGER IF NOT EXISTS plan_revisions_no_delete
BEFORE DELETE ON plan_revisions
BEGIN
    SELECT RAISE(ABORT, 'plan revision is immutable');
END;

-- 복합 키와 rowid 충돌을 삽입 전에 모두 거부한다
CREATE TRIGGER IF NOT EXISTS plan_revisions_no_reinsert
BEFORE INSERT ON plan_revisions
WHEN EXISTS (
    SELECT 1 FROM plan_revisions
    WHERE (plan_id = NEW.plan_id AND revision = NEW.revision) OR rowid = NEW.rowid
)
BEGIN
    SELECT RAISE(ABORT, 'plan revision is immutable');
END;
