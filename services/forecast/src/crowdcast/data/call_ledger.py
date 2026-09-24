"""한국 날짜별 공공데이터 호출을 잠금과 원자적 저장으로 기록해 공유 한도를 지킨다."""

import csv
import fcntl
import io
import os
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from tempfile import NamedTemporaryFile
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
DAILY_LIMIT = 900


# 한도 중단을 통신 오류와 구분해 재시도를 막는다.
class CallLimitReached(RuntimeError):
    pass


# API의 날짜 경계와 장부 날짜를 한국 시간으로 통일한다.
def korea_today() -> date:
    return datetime.now(KST).date()


# 교체되지 않는 별도 잠금 파일로 여러 프로세스의 읽기·쓰기를 직렬화한다.
@contextmanager
def file_lock(path: Path) -> Iterator[None]:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


# 같은 디렉터리의 임시 파일을 교체해 중단 시 기존 장부·캐시를 보존한다.
def atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


# 재시도와 실패도 전송 전에 차감하고 실행별 예산은 별도로 제한한다.
class CallLedger:
    # 호출 장부 위치와 이번 실행의 최대 외부 호출 수를 고정한다.
    def __init__(self, path: Path, *, max_calls: int = 800) -> None:
        if max_calls < 0:
            raise ValueError("max_calls는 0 이상이어야 합니다")
        self.path = path
        self.max_calls = max_calls
        self.calls = 0

    # 잘못된 장부를 빈 장부로 취급하면 한도를 우회하므로 명시적으로 중단한다.
    def _read(self) -> dict[tuple[str, str], int]:
        if not self.path.exists():
            return {}
        try:
            with self.path.open(newline="", encoding="utf-8") as stream:
                reader = csv.DictReader(stream)
                if reader.fieldnames != ["date", "api", "calls"]:
                    raise ValueError
                counts: dict[tuple[str, str], int] = {}
                for row in reader:
                    day, api, calls = row["date"], row["api"], int(row["calls"])
                    if date.fromisoformat(day).isoformat() != day or not api or calls < 1:
                        raise ValueError
                    counts[day, api] = counts.get((day, api), 0) + calls
                return counts
        except (ValueError, KeyError, TypeError, csv.Error):
            raise RuntimeError("호출 장부 형식 오류: 수동 확인 필요") from None

    # 모든 API의 합계를 검사한 뒤 실제 전송 한 건을 먼저 확정한다.
    def reserve(self, api: str) -> None:
        with file_lock(self.path.with_suffix(".lock")):
            day = korea_today().isoformat()
            counts = self._read()
            if sum(n for (d, _), n in counts.items() if d == day) >= DAILY_LIMIT:
                raise CallLimitReached("한국 날짜 기준 공유 호출 한도 900건 도달")
            if self.calls >= self.max_calls:
                raise CallLimitReached("이번 실행의 max_calls 한도 도달")
            counts[day, api] = counts.get((day, api), 0) + 1
            output = io.StringIO(newline="")
            writer = csv.writer(output)
            writer.writerow(["date", "api", "calls"])
            writer.writerows((d, a, n) for (d, a), n in sorted(counts.items()))
            atomic_write(self.path, output.getvalue().encode())
            self.calls += 1
