"""이미지 요청을 별도 장부에 기록하고 간격·총량·형식·크기 제한을 적용한다."""

import csv
import math
import os
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx

from crowdcast.data.image_cache import MAX_BYTES, MEDIA_TYPES


# 예산 소진은 이미지 한 건의 형식 오류와 구분해 전체 받기를 중단한다.
class ImageRequestLimit(RuntimeError):
    pass


# HTML 오류 본문을 이미지로 저장하지 않도록 지원 형식의 서명을 확인한다.
def matches_image(content: bytes, content_type: str) -> bool:
    if content_type == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    return content.startswith(b"RIFF") and content[8:12] == b"WEBP"


# 리다이렉트도 개별 외부 요청으로 세고 재시도는 다음 명시적 실행에 맡긴다.
class ImageDownloader:
    # 설정 오류는 파일 기록이나 외부 요청보다 먼저 거부한다.
    def __init__(self, client: httpx.Client, directory: Path, max_requests: int, interval: float) -> None:
        if max_requests < 0 or not math.isfinite(interval) or interval < 0:
            raise ValueError("max_requests와 interval_seconds는 0 이상이어야 합니다")
        self.client = client
        self.directory = directory
        self.max_requests = max_requests
        self.interval = interval
        self.requests = 0
        self.last_request: float | None = None

    # 실패·중단도 실제 전송 시도로 남기며 data.go.kr API 장부에는 쓰지 않는다.
    def reserve(self, event_id: str, url: str) -> None:
        if self.requests >= self.max_requests:
            raise ImageRequestLimit("이미지 외부 요청 총량 도달")
        if self.last_request is not None:
            time.sleep(max(0, self.interval - (time.monotonic() - self.last_request)))
        path = self.directory / "requests.csv"
        self.directory.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8", newline="") as stream:
            writer = csv.writer(stream)
            if stream.tell() == 0:
                writer.writerow(["requested_at", "event_id", "url"])
            writer.writerow([datetime.now(UTC).isoformat(), event_id, url])
            stream.flush()
            os.fsync(stream.fileno())
        self.requests += 1
        self.last_request = time.monotonic()

    # 원본 확장자와 응답 MIME이 일치하고 제한 안에 완전히 받은 바이트만 반환한다.
    def download(self, event_id: str, url: str) -> tuple[bytes, str, str]:
        suffix = Path(urlsplit(url).path).suffix
        expected = MEDIA_TYPES.get(suffix.lower())
        if expected is None:
            raise ValueError("지원하지 않는 이미지 확장자")
        for _ in range(4):
            address = urlsplit(url)
            if address.scheme not in {"http", "https"} or not address.hostname or address.username:
                raise ValueError("이미지 원본 URL 오류")
            self.reserve(event_id, url)
            with self.client.stream("GET", url, follow_redirects=False) as response:
                if response.is_redirect and response.headers.get("location"):
                    url = urljoin(url, response.headers["location"])
                    continue
                response.raise_for_status()
                content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                if content_type != expected:
                    raise ValueError("이미지 확장자와 Content-Type 불일치")
                if int(response.headers.get("content-length", "0")) > MAX_BYTES:
                    raise ValueError("이미지 크기 5MB 초과")
                content = bytearray()
                for chunk in response.iter_bytes(chunk_size=65536):
                    if len(content) + len(chunk) > MAX_BYTES:
                        raise ValueError("이미지 크기 5MB 초과")
                    content.extend(chunk)
                raw = bytes(content)
                if not matches_image(raw, content_type):
                    raise ValueError("이미지 본문 형식 오류")
                return raw, suffix, content_type
        raise ValueError("이미지 리다이렉트 횟수 초과")
