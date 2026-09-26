-- 같은 예보 ID의 재삽입을 거부해 REPLACE와 UPSERT도 발행 원문을 바꾸지 못하게 한다
CREATE TRIGGER forecast_snapshots_no_reinsert
BEFORE INSERT ON forecast_snapshots
WHEN EXISTS (
    SELECT 1 FROM forecast_snapshots WHERE forecast_id = NEW.forecast_id
)
BEGIN
    SELECT RAISE(ABORT, 'forecast snapshot is immutable');
END;
