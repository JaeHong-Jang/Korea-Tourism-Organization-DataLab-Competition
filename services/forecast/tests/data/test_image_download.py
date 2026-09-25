"""이미지의 스트리밍 크기·형식·전송 간격·리다이렉트를 외부 통신 없이 검증한다."""

import csv
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
from crowdcast.data import image_download
from crowdcast.data.image_cache import MAX_BYTES
from crowdcast.data.image_download import ImageDownloader


# 응답 본문을 미리 합치지 않고 5MB 경계를 넘는 청크를 순차적으로 공급한다.
class OversizedImage(httpx.SyncByteStream):
    # 크기 초과가 확인된 뒤에는 남은 스트림을 읽지 않아야 한다.
    def __iter__(self) -> Iterator[bytes]:
        for _ in range(MAX_BYTES // 65536 + 1):
            yield b"x" * 65536
        pytest.fail("제한을 넘긴 본문을 계속 읽었습니다")


# 헤더가 없거나 거짓이어도 스트리밍 누적 크기를 기준으로 중단한다.
@pytest.mark.parametrize("length", [None, "1", str(MAX_BYTES + 1)])
def test_size_limit(tmp_path: Path, length: str | None) -> None:
    headers = {"content-type": "image/jpeg"}
    if length is not None:
        headers["content-length"] = length
    transport = httpx.MockTransport(lambda request: httpx.Response(
        200, headers=headers, stream=OversizedImage(),
    ))
    with httpx.Client(transport=transport) as client:
        downloader = ImageDownloader(client, tmp_path, 1, 0)
        with pytest.raises(ValueError, match="5MB 초과"):
            downloader.download("e-suwon-2026", "https://images.example/suwon.jpg")
    assert downloader.requests == 1
    assert not list(tmp_path.glob("*.jpg"))


# 정확히 5MB인 정상 형식은 허용하고 원본 바이트를 그대로 반환한다.
def test_exact_size_limit(tmp_path: Path) -> None:
    raw = b"\xff\xd8\xff" + b"x" * (MAX_BYTES - 3)
    transport = httpx.MockTransport(lambda request: httpx.Response(
        200, content=raw, headers={"content-type": "image/jpeg"},
    ))
    with httpx.Client(transport=transport) as client:
        assert ImageDownloader(client, tmp_path, 1, 0).download(
            "e-suwon-2026", "https://images.example/suwon.jpeg",
        ) == (raw, ".jpeg", "image/jpeg")


# 확장자와 MIME 불일치·비이미지·빈 본문은 캐시 파일이 될 수 없다.
@pytest.mark.parametrize(("content_type", "raw"), [
    ("text/html", b"<html>error</html>"), ("image/png", b"\x89PNG\r\n\x1a\n"),
    ("image/jpeg", b"<html>error</html>"), ("image/jpeg", b""),
])
def test_content_type_and_signature(tmp_path: Path, content_type: str, raw: bytes) -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(
        200, content=raw, headers={"content-type": content_type},
    ))
    with httpx.Client(transport=transport) as client:
        with pytest.raises(ValueError):
            ImageDownloader(client, tmp_path, 1, 0).download(
                "e-suwon-2026", "https://images.example/suwon.jpg",
            )


# 지원하지 않는 확장자·프로토콜은 전송하기 전에 걸러 호출 수를 쓰지 않는다.
@pytest.mark.parametrize("url", ["file:///tmp/suwon.jpg", "https://images.example/suwon.svg"])
def test_invalid_source(tmp_path: Path, url: str) -> None:
    with httpx.Client(transport=httpx.MockTransport(lambda request: pytest.fail("외부 요청"))) as client:
        downloader = ImageDownloader(client, tmp_path, 1, 0)
        with pytest.raises(ValueError):
            downloader.download("e-suwon-2026", url)
    assert downloader.requests == 0


# 리다이렉트와 다음 파일도 같은 전송 시계를 사용하고 요청마다 장부에 남긴다.
def test_request_interval_and_redirect(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    now = [10.0]
    times = []

    # 실제 기다림 대신 단조 시계를 전진시켜 요청 사이 간격을 검사한다.
    def sleep(seconds: float) -> None:
        now[0] += seconds

    # 첫 요청만 상대 URL로 이동하고 이후에는 정상 WebP 서명을 반환한다.
    def respond(request: httpx.Request) -> httpx.Response:
        times.append(now[0])
        if len(times) == 1:
            return httpx.Response(302, headers={"location": "/original.webp"})
        return httpx.Response(200, content=b"RIFF0000WEBP", headers={"content-type": "image/webp"})

    monkeypatch.setattr(image_download.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(image_download.time, "sleep", sleep)
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        downloader = ImageDownloader(client, tmp_path, 3, 1.5)
        for event_id in ("e-suwon-2026", "e-jinju-2026"):
            assert downloader.download(event_id, "https://images.example/festival.webp")[2] == "image/webp"
    assert times == [10.0, 11.5, 13.0]
    with (tmp_path / "requests.csv").open() as stream:
        assert len(list(csv.DictReader(stream))) == 3


# 음수·무한 간격은 한도 우회나 무기한 대기를 만들기 전에 거부한다.
@pytest.mark.parametrize(("budget", "interval"), [(-1, 1), (1, -1), (1, float("nan")), (1, float("inf"))])
def test_invalid_limits(tmp_path: Path, budget: int, interval: float) -> None:
    with httpx.Client(transport=httpx.MockTransport(lambda request: pytest.fail("외부 요청"))) as client:
        with pytest.raises(ValueError):
            ImageDownloader(client, tmp_path, budget, interval)
