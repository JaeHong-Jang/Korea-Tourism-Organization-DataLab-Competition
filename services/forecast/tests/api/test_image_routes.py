"""대표 이미지 라우트의 캐시 응답과 다가오는 행사 요약 계약을 검증한다."""

import json
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.api.assemble.http import endpoint_validator
from crowdcast.data.image_cache import write_index
from fastapi.testclient import TestClient


# API가 실제 공유 이미지에 접근하지 않도록 캐시 경로도 격리한다.
@pytest.fixture(autouse=True)
def image_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    cache = tmp_path / "cache"
    monkeypatch.setattr(paths, "CACHE", cache)
    (cache / "images").mkdir(parents=True)
    return cache / "images"


# 국내 행사 계약 픽스처와 같은 ID로 원본 파일·출처 색인을 준비한다.
def store_image(directory: Path, suffix: str = ".jpg", content_type: str = "image/jpeg") -> tuple[str, bytes]:
    row = json.loads((paths.REPO_ROOT / "packages/contracts/fixtures/festival-summary/valid-card.json")
                     .read_bytes())
    event_id = row["eventId"]
    content = b"\xff\xd8\xffsuwon-fixture"
    filename = event_id + suffix
    (directory / filename).write_bytes(content)
    write_index(directory, {event_id: {
        "file": filename, "content_type": content_type, "source_url": f"https://images.example/suwon{suffix}",
        "copyright": "Type1", "fetched_at": datetime.now(UTC).isoformat(),
        "sha256": sha256(content).hexdigest(),
    }})
    return event_id, content


# 캐시 파일 바이트와 MIME·하루 캐시 헤더를 그대로 반환한다.
@pytest.mark.parametrize(("suffix", "content_type"), [
    (".jpg", "image/jpeg"), (".png", "image/png"), (".webp", "image/webp"),
])
def test_image_response(client: TestClient, image_cache: Path, suffix: str, content_type: str) -> None:
    event_id, content = store_image(image_cache, suffix, content_type)
    response = client.get(f"/v1/images/{event_id}")
    assert response.status_code == 200 and response.content == content
    assert response.headers["content-type"] == content_type
    assert response.headers["cache-control"] == "max-age=86400"


# 색인·파일 부재와 잘못된 ID는 받기를 시도하지 않고 404로 끝낸다.
def test_missing_image(client: TestClient, image_cache: Path) -> None:
    assert client.get("/v1/images/e-jinju-2026").status_code == 404
    event_id, _ = store_image(image_cache)
    (image_cache / f"{event_id}.jpg").unlink()
    assert client.get(f"/v1/images/{event_id}").status_code == 404
    assert client.get("/v1/images/invalid-id").status_code == 404


# 색인이 가리키는 캐시 밖 파일과 심볼릭 링크는 이미지로 제공하지 않는다.
@pytest.mark.parametrize("mode", ["traversal", "symlink", "content_type", "broken_index"])
def test_invalid_cache_entry(client: TestClient, image_cache: Path, mode: str) -> None:
    event_id, _ = store_image(image_cache)
    index = json.loads((image_cache / "index.json").read_bytes())
    outside = image_cache.parent / "private.jpg"
    outside.write_bytes(b"private")
    if mode == "traversal":
        index[event_id]["file"] = "../private.jpg"
    elif mode == "symlink":
        file = image_cache / f"{event_id}.jpg"
        file.unlink()
        file.symlink_to(outside)
    elif mode == "content_type":
        index[event_id]["content_type"] = "text/html"
    write_index(image_cache, index)
    if mode == "broken_index":
        (image_cache / "index.json").write_text("broken")
    assert client.get(f"/v1/images/{event_id}").status_code == 404


# 원본 일괄 예보는 유지하며 실제 캐시가 있는 응답에만 출처가 필수인 image를 붙인다.
@pytest.mark.parametrize(("copyright_code", "label"), [
    ("Type1", "공공누리 제1유형"), ("3", "공공누리 제3유형"),
    (None, "공공누리 유형 미상"), ("공공누리 제2유형", "공공누리 제2유형"),
])
def test_summary_image_contract(
    client: TestClient, image_cache: Path, copyright_code: str | None, label: str,
) -> None:
    event_id, _ = store_image(image_cache)
    index = json.loads((image_cache / "index.json").read_bytes())
    index[event_id]["copyright"] = copyright_code
    write_index(image_cache, index)
    row = json.loads((paths.REPO_ROOT / "packages/contracts/fixtures/festival-summary/valid-card.json")
                     .read_bytes())
    file = paths.PROCESSED / "upcoming.parquet"
    pl.DataFrame([{**row, "runId": "batch-suwon"}]).write_parquet(file, metadata={"runId": "batch-suwon"})
    original = file.read_bytes()
    response = client.get("/v1/festivals/upcoming")
    assert response.status_code == 200, response.text
    body = response.json()
    endpoint_validator("/v1/festivals/upcoming", "response").validate(body)
    assert body[0]["image"] == {"url": f"/api/images/{event_id}", "credit": f"한국관광공사 TourAPI · {label}"}
    assert response.headers["x-run-id"] == "batch-suwon"
    assert file.read_bytes() == original
    (image_cache / f"{event_id}.jpg").unlink()
    response = client.get("/v1/festivals/upcoming")
    assert response.status_code == 200 and "image" not in response.json()[0]
    endpoint_validator("/v1/festivals/upcoming", "response").validate(response.json())
