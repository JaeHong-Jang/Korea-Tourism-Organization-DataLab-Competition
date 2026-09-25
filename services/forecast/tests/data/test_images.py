"""이미지 CLI의 대상 제한·재실행·색인·독립 요청 장부를 MockTransport로 검증한다."""

import csv
import json
from datetime import datetime
from functools import partial
from hashlib import sha256
from pathlib import Path

import httpx
import polars as pl
import pytest
from crowdcast import paths
from crowdcast.data import images
from crowdcast.data.image_cache import MAX_BYTES, read_index

PNG = b"\x89PNG\r\n\x1a\n" + b"suwon-fixture"
EVENT_ID = "e-suwon-hwaseong-2026"
SOURCE_URL = "https://images.example/suwon.PNG"


# 실제 공유 파일 대신 일괄 예보·마스터·기존 data.go.kr 장부를 임시 경로에 둔다.
@pytest.fixture
def image_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    processed, cache = tmp_path / "processed", tmp_path / "cache"
    processed.mkdir()
    (cache / "datago").mkdir(parents=True)
    monkeypatch.setattr(paths, "PROCESSED", processed)
    monkeypatch.setattr(paths, "CACHE", cache)
    (cache / "datago/ledger.csv").write_text("date,api,calls\n2026-09-25,festivals,30\n")
    pl.DataFrame([{"eventId": EVENT_ID}]).write_parquet(processed / "upcoming.parquet")
    pl.DataFrame([
        {"event_id": EVENT_ID, "image_url": SOURCE_URL, "image_copyright": "Type1"},
        {"event_id": "e-jinju-namgang-2026", "image_url": "https://images.example/jinju.jpg",
         "image_copyright": None},
    ]).write_parquet(processed / "events.parquet")
    return cache / "images"


# CLI를 두 번 실행해 대상 한 건만 받고 원본 확장자·해시·출처를 보존하는지 확인한다.
def test_cli_fetch_and_skip(
    image_data: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str],
) -> None:
    requests = []

    # 경로가 다른 마스터 행은 네트워크 요청으로 이어지지 않아야 한다.
    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        return httpx.Response(200, content=PNG, headers={"content-type": "image/png"})

    monkeypatch.setattr(images, "fetch_upcoming", partial(images.fetch_upcoming,
                                                       transport=httpx.MockTransport(respond)))
    batch = (paths.PROCESSED / "upcoming.parquet").read_bytes()
    api_ledger = (paths.CACHE / "datago/ledger.csv").read_bytes()
    args = ["fetch", "--upcoming", "--max-requests", "2", "--interval-seconds", "0"]
    images.main(args)
    assert json.loads(capsys.readouterr().out)["downloaded"] == 1
    images.main(args)
    result = json.loads(capsys.readouterr().out)
    assert result["cached"] == 1 and result["requests"] == 0
    assert requests == [SOURCE_URL]
    entry = read_index(image_data)[EVENT_ID]
    assert entry["file"] == f"{EVENT_ID}.PNG"
    assert entry["source_url"] == SOURCE_URL and entry["copyright"] == "Type1"
    assert entry["sha256"] == sha256(PNG).hexdigest()
    assert datetime.fromisoformat(entry["fetched_at"]).tzinfo is not None
    assert (image_data / entry["file"]).read_bytes() == PNG
    assert (paths.PROCESSED / "upcoming.parquet").read_bytes() == batch
    assert (paths.CACHE / "datago/ledger.csv").read_bytes() == api_ledger
    with (image_data / "requests.csv").open() as stream:
        assert len(list(csv.DictReader(stream))) == 1


# 누락된 실제 파일은 색인만 믿고 건너뛰지 않으며 성공한 요청만 다시 색인에 올린다.
def test_missing_cache_file_is_downloaded_again(image_data: Path) -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(
        200, content=PNG, headers={"content-type": "image/png"},
    ))
    images.fetch_upcoming(transport=transport, interval_seconds=0)
    (image_data / f"{EVENT_ID}.PNG").unlink()
    result = images.fetch_upcoming(transport=transport, interval_seconds=0)
    assert result["downloaded"] == 1 and result["requests"] == 1


# 이미지 열이 없는 이전 마스터와 URL 결측 행사는 외부 요청 없이 건너뛴다.
def test_legacy_master_has_no_images(image_data: Path) -> None:
    pl.DataFrame([{"event_id": EVENT_ID}]).write_parquet(paths.PROCESSED / "events.parquet")
    result = images.fetch_upcoming(transport=httpx.MockTransport(lambda request: pytest.fail("외부 요청")))
    assert result["missing_url"] == 1 and result["requests"] == 0
    assert not (image_data / "requests.csv").exists()


# 요청 실패도 독립 장부에 남기고 색인·부분 이미지 파일은 발행하지 않는다.
def test_failed_request_is_counted(image_data: Path) -> None:
    result = images.fetch_upcoming(transport=httpx.MockTransport(lambda request: httpx.Response(404)))
    assert result["requests"] == 1 and result["skipped"] == 1
    assert read_index(image_data) == {}
    assert not list(image_data.glob("*.PNG"))
    with (image_data / "requests.csv").open() as stream:
        assert len(list(csv.DictReader(stream))) == 1


# 크기나 MIME이 잘못된 응답은 CLI 집계에 건너뜀으로 남고 파일·색인을 만들지 않는다.
@pytest.mark.parametrize("invalid", ["oversized", "wrong_type"])
def test_invalid_response_is_not_published(image_data: Path, invalid: str) -> None:
    headers = {"content-type": "image/png"}
    if invalid == "oversized":
        headers["content-length"] = str(MAX_BYTES + 1)
    else:
        headers["content-type"] = "text/html"
    result = images.fetch_upcoming(transport=httpx.MockTransport(lambda request: httpx.Response(
        200, content=PNG, headers=headers,
    )))
    assert result["requests"] == 1 and result["skipped"] == 1
    assert read_index(image_data) == {} and not list(image_data.glob("*.PNG"))


# 다음 행사와 리다이렉트도 같은 총량을 사용해 설정한 요청 수를 넘지 않는다.
def test_redirect_uses_request_budget(image_data: Path) -> None:
    requests = []

    # 리다이렉트 대상도 받으려면 별도의 요청 예산이 필요하다.
    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(302, headers={"location": "/original.PNG"})

    result = images.fetch_upcoming(max_requests=1, interval_seconds=0,
                                   transport=httpx.MockTransport(respond))
    assert result["requests"] == 1 and result["limited"] == 1 and len(requests) == 1
    assert read_index(image_data) == {}


# 예산이 0이면 받기 대상이 있어도 외부 요청과 전송 장부는 만들지 않는다.
def test_zero_budget(image_data: Path) -> None:
    result = images.fetch_upcoming(max_requests=0,
                                   transport=httpx.MockTransport(lambda request: pytest.fail("외부 요청")))
    assert result["requests"] == 0 and result["limited"] == 1
    assert not (image_data / "requests.csv").exists()


# 다른 행사가 남아 있어도 실행 한도를 넘기지 않고 받은 첫 이미지의 색인은 유지한다.
def test_total_budget_between_events(image_data: Path) -> None:
    pl.DataFrame([{"eventId": EVENT_ID}, {"eventId": "e-jinju-namgang-2026"}]).write_parquet(
        paths.PROCESSED / "upcoming.parquet",
    )
    transport = httpx.MockTransport(lambda request: httpx.Response(
        200, content=b"\xff\xd8\xffjinju-fixture", headers={"content-type": "image/jpeg"},
    ))
    result = images.fetch_upcoming(max_requests=1, interval_seconds=0, transport=transport)
    assert result["downloaded"] == 1 and result["limited"] == 1 and result["requests"] == 1
    assert list(read_index(image_data)) == ["e-jinju-namgang-2026"]
