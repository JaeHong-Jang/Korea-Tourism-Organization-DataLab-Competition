"""Dagster 계보 내보내기 형식과 상대 경로·단계 의존성을 검증한다."""

from pathlib import PurePosixPath
from typing import Annotated, Literal, Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

STAGES = ("fetch", "labels", "features", "train", "backtest", "batch", "publish")
Text = Annotated[str, Field(min_length=1)]
Digest = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


# 필드 오타나 문자열 불리언을 조용히 보정하지 않는다.
class LineageRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


# 기록 시점의 파일 해시만 받아 현재 파일로 누락된 해시를 채우지 않는다.
class LineageFile(LineageRecord):
    path: Text
    sha256: Digest | None
    rows: Annotated[int, Field(ge=0)] | None = None

    # 데이터 루트 밖 경로와 플랫폼별 별칭을 거부한다.
    @field_validator("path")
    @classmethod
    def relative_path(cls, value: str) -> str:
        path = PurePosixPath(value)
        if (
            path.is_absolute() or ".." in path.parts or "\\" in value
            or path.parts[0] not in {"data", "models", "reports"}
            or str(path) != value or len(path.parts) < 2
        ):
            raise ValueError("파일 경로는 data/models/reports 아래 정규 상대 경로여야 한다")
        return value


# 미검증은 실패와 구분해 null 그대로 받는다.
class Gate(LineageRecord):
    passed: bool | None
    message: str


# 자산별 마지막 실행과 실패·건너뜀 상태를 보존한다.
class Asset(LineageRecord):
    key: Text
    deps: list[Text]
    inputFiles: list[LineageFile]
    outputFiles: list[LineageFile]
    lastRunId: Text | None
    dagsterRunId: Text | None
    status: Literal["passed", "failed", "skipped"] | None
    gate: Gate | None


# 알려진 일곱 단계의 순서와 선행 참조를 검사해 순환·끊긴 링크를 막는다.
class LineageDocument(LineageRecord):
    schemaVersion: Literal[1]
    exportedAt: AwareDatetime
    assets: list[Asset]

    # 내보내기 정본의 순서와 참조 가능한 선행 단계 집합을 대조한다.
    @model_validator(mode="after")
    def stage_order(self) -> Self:
        if [asset.key for asset in self.assets] != [f"crowdcast/{name}" for name in STAGES]:
            raise ValueError("계보 자산은 fetch부터 publish까지 STAGES 순서여야 한다")
        seen = set()
        for asset in self.assets:
            if len(set(asset.deps)) != len(asset.deps) or not set(asset.deps).issubset(seen):
                raise ValueError("계보 의존성은 중복 없이 앞 단계만 참조해야 한다")
            seen.add(asset.key)
        return self
