-- 발행 스냅샷을 보존하면서 저장한 행사 목록에서는 삭제된 행사를 숨긴다
ALTER TABLE events ADD COLUMN deleted_at TEXT;

-- 활성 행사 조회와 삭제된 행사 판정을 빠르게 한다
CREATE INDEX events_deleted_at ON events(deleted_at);
