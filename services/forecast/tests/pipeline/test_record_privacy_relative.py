"""상대 데이터 루트에서도 운영 성적의 소수점과 모델 버전을 보존한다."""

from pathlib import Path

from crowdcast import paths
from crowdcast.pipeline.record_privacy import public_text


# 개인정보 경로 마스킹이 숫자나 상대 산출물 이름까지 변경하지 않게 한다.
def test_relative_root_preserves_metrics_and_hides_absolute_path(monkeypatch):
    monkeypatch.setattr(paths, "DATA_ROOT", Path("."))
    monkeypatch.setattr(paths, "DATA", Path("data"))
    monkeypatch.setattr(paths, "MODELS", Path("models"))
    text = "MdAPE=52.283% (직전 49.344% +3%p); 포함률=56.977% (직전 56.977% -5%p)"
    assert public_text(text) == text
    assert public_text("model v1.2.3") == "model v1.2.3"
    absolute = str(Path("data").resolve() / "labels.parquet")
    assert public_text(absolute) == "data/labels.parquet"
