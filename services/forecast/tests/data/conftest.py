"""네트워크를 차단하고 실제 연도별 머리글 구조를 닮은 작은 xlsx를 만든다."""

import socket
from collections.abc import Callable
from pathlib import Path

import pytest
from openpyxl import Workbook


# 합성 파일 검증 중 외부 서비스에 접속하면 즉시 실패시킨다.
@pytest.fixture(autouse=True)
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    # 네트워크 허용 여부와 무관하게 테스트가 로컬 입력만 쓰게 한다.
    def reject(*args: object, **kwargs: object) -> None:
        raise AssertionError("T-100 테스트의 네트워크 호출 금지")

    monkeypatch.setattr(socket.socket, "connect", reject)
    monkeypatch.setattr(socket, "create_connection", reject)


# 행·병합 범위를 주면 제목과 빈 총괄 시트를 가진 임시 원본을 만든다.
@pytest.fixture
def xlsx(tmp_path: Path) -> Callable:
    # 테스트마다 다른 머리글 위치·병합 구조를 실제 xlsx로 직렬화한다.
    def write(rows: list[list[object]], merges: tuple[str, ...] = (), sheet_name: str = "서울") -> Path:
        workbook = Workbook()
        workbook.active.title = "총괄"
        workbook.active.append(["지역별 축제 합계", 2])
        sheet = workbook.create_sheet(sheet_name)
        for row in rows:
            sheet.append(row)
        for area in merges:
            sheet.merge_cells(area)
        path = tmp_path / "지역축제 개최계획.xlsx"
        workbook.save(path)
        workbook.close()
        return path

    return write
