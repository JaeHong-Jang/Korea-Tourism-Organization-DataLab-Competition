"""다가오는 일괄 예보 행사의 TourAPI 대표 이미지를 제한된 요청으로 로컬에 받는다."""

import argparse
import json
from collections import Counter
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any

import httpx
import polars as pl

from crowdcast import paths
from crowdcast.data.call_ledger import atomic_write, file_lock
from crowdcast.data.image_cache import EVENT_ID, cache_directory, cached_image, read_index, write_index
from crowdcast.data.image_download import ImageDownloader, ImageRequestLimit


# 일괄 예보에 실린 ID만 마스터와 연결하며 보강 전 마스터는 이미지 없는 입력으로 취급한다.
def upcoming_images() -> list[dict[str, Any]]:
    upcoming = pl.read_parquet(paths.PROCESSED / "upcoming.parquet", columns=["eventId"])
    events = pl.read_parquet(paths.PROCESSED / "events.parquet")
    for field in ("image_url", "image_copyright"):
        if field not in events.columns:
            events = events.with_columns(pl.lit(None, dtype=pl.String).alias(field))
    return upcoming.unique().join(
        events.select("event_id", "image_url", "image_copyright"),
        left_on="eventId", right_on="event_id", how="left", validate="1:1",
    ).sort("eventId").to_dicts()


# 한 실행만 캐시를 갱신하고 성공한 이미지마다 색인을 발행해 재실행 시 건너뛴다.
def fetch_upcoming(
    *, max_requests: int = 100, interval_seconds: float = 1.0,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, int]:
    rows = upcoming_images()
    directory = cache_directory()
    counts = Counter(selected=len(rows), downloaded=0, cached=0, missing_url=0, skipped=0, limited=0)
    with file_lock(directory / ".fetch.lock"), httpx.Client(transport=transport, timeout=30) as client:
        downloader = ImageDownloader(client, directory, max_requests, interval_seconds)
        index = read_index(directory)
        for row in rows:
            event_id, url = row["eventId"], row["image_url"]
            if not EVENT_ID.fullmatch(event_id):
                counts["skipped"] += 1
                continue
            if cached_image(directory, index, event_id):
                counts["cached"] += 1
                continue
            if not url:
                counts["missing_url"] += 1
                continue
            try:
                content, suffix, content_type = downloader.download(event_id, url)
            except ImageRequestLimit:
                counts["limited"] = 1
                break
            except (ValueError, httpx.HTTPError, httpx.InvalidURL):
                counts["skipped"] += 1
                continue
            # 다운로드 성공 뒤 파일을 먼저 교체하고 같은 바이트의 해시·출처를 함께 발행한다.
            filename = event_id + suffix
            atomic_write(directory / filename, content)
            index[event_id] = {
                "file": filename, "source_url": url, "copyright": row["image_copyright"],
                "fetched_at": datetime.now(UTC).isoformat(), "sha256": sha256(content).hexdigest(),
                "content_type": content_type,
            }
            write_index(directory, index)
            counts["downloaded"] += 1
    return {**counts, "requests": downloader.requests}


# 실제 받기는 명시적인 fetch --upcoming으로만 시작하며 요청 한도와 간격을 노출한다.
def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    fetch = commands.add_parser("fetch", help="다가오는 일괄 예보 이미지 받기")
    fetch.add_argument("--upcoming", action="store_true", required=True)
    fetch.add_argument("--max-requests", type=int, default=100, help="리다이렉트를 포함한 실행 요청 한도")
    fetch.add_argument("--interval-seconds", type=float, default=1.0, help="요청 사이 최소 간격(초)")
    args = parser.parse_args(argv)
    result = fetch_upcoming(max_requests=args.max_requests, interval_seconds=args.interval_seconds)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
