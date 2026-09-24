-- 사전 등록 예보는 순번과 예보 ID를 한 번만 저장한다
CREATE UNIQUE INDEX ledger_entries_forecast_id ON ledger_entries(forecast_id);

-- 저장한 원장 행은 해시와 본문을 포함해 어떤 열도 수정할 수 없다
CREATE TRIGGER ledger_entries_no_update
BEFORE UPDATE ON ledger_entries
BEGIN
    SELECT RAISE(ABORT, 'ledger entry is immutable');
END;

-- 직접 삭제와 REPLACE의 암묵적 삭제를 모두 거부한다
CREATE TRIGGER ledger_entries_no_delete
BEFORE DELETE ON ledger_entries
BEGIN
    SELECT RAISE(ABORT, 'ledger entry is immutable');
END;

-- 같은 순번·예보 ID를 다시 넣는 충돌 구문을 삭제 전에 거부한다
CREATE TRIGGER ledger_entries_no_reinsert
BEFORE INSERT ON ledger_entries
WHEN EXISTS (
    SELECT 1 FROM ledger_entries
    WHERE seq = NEW.seq OR forecast_id = NEW.forecast_id OR rowid = NEW.rowid
)
BEGIN
    SELECT RAISE(ABORT, 'ledger entry is immutable');
END;
