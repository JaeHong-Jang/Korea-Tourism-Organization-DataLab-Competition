"""골드·실버 라벨을 오프라인으로 검증한 뒤 Parquet·DIY 템플릿·QC를 갱신한다."""

import argparse
import hashlib
import io
import json
from pathlib import Path

import pandera.polars as pa
import polars as pl
from crowdcast import paths
from crowdcast.data.call_ledger import atomic_write
from crowdcast.labels.g0 import build_g0
from crowdcast.labels.gold_a import build_gold_a
from crowdcast.labels.gold_b import build_gold_b, prepare_template
from crowdcast.labels.matching import EventMatcher
from crowdcast.labels.merge import merge_labels
from crowdcast.labels.qc import quality_report
from crowdcast.labels.schema import validate_labels
from crowdcast.labels.silver import build_silver
from crowdcast.labels.silver_qc import enforce_silver_gate, signal_retention, silver_metrics


# 정렬된 JSON과 고정 줄바꿈을 모든 스냅샷·출력 해시에 공통으로 적용한다.
def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode()


# 명시한 골든 파일의 오류를 골든 0건으로 삼아 학습 누수를 만들지 않는다.
def read_golden(path: Path | None) -> set[str]:
    if path is None:
        return set()
    raw = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(raw, list) or any(not isinstance(value, str) or not value for value in raw):
        raise ValueError("골든 파일은 event_id 문자열의 JSON 배열이어야 합니다")
    return set(raw)


# 모든 검증과 직렬화가 끝나기 전에는 기존 산출물이나 사람이 채운 템플릿을 바꾸지 않는다.
def build(golden_file: Path | None = None) -> dict[str, object]:
    golden = read_golden(golden_file)
    g0_path = paths.PROCESSED / "labels_g0.json"
    previous_g0_bytes = g0_path.read_bytes() if g0_path.exists() else None
    previous_g0 = json.loads(previous_g0_bytes) if previous_g0_bytes is not None else None
    if previous_g0_bytes is not None and (
        not isinstance(previous_g0, dict) or previous_g0.get("schema_version") != 1
    ):
        raise ValueError("직전 labels_g0.json 형식·schema_version 오류")
    events = pl.read_parquet(paths.PROCESSED / "events.parquet").to_dicts()
    if len({event["event_id"] for event in events}) != len(events):
        raise ValueError("events.event_id 중복")
    matcher, unmatched, skipped = EventMatcher(events), [], []
    template_path = paths.PROCESSED / "diy_labels_template.csv"
    previous = template_path.read_bytes() if template_path.exists() else None
    template, diy_rows = prepare_template(paths.PROCESSED / "diy_targets.csv", template_path)
    gold_a = build_gold_a(paths.DATA, matcher, unmatched)
    gold_b = build_gold_b(
        diy_rows, template_path.relative_to(paths.DATA).as_posix(), matcher, unmatched, skipped
    )
    diagnostics = []
    silver, excluded = build_silver(
        events,
        pl.read_parquet(paths.PROCESSED / "region_daily.parquet"),
        (paths.PROCESSED / "region_daily.parquet").relative_to(paths.DATA).as_posix(),
        diagnostics=diagnostics,
    )
    labels = validate_labels(merge_labels(gold_a + gold_b + silver, golden))

    # Parquet 인코딩 옵션과 행 그룹 크기를 고정하고 실행 시각 같은 가변 메타데이터는 넣지 않는다.
    buffer = io.BytesIO()
    labels.write_parquet(
        buffer, compression="zstd", compression_level=3, statistics=True, row_group_size=65_536
    )

    # 반올림 전 후보와 입력을 묶어 같은 스냅샷인지 확인한 뒤 직전 신호 수를 비교한다.
    audit = {
        "schema_version": 1,
        "labels_sha256": hashlib.sha256(buffer.getvalue()).hexdigest(),
        "g0": build_g0(labels, events),
        "silver": silver_metrics(diagnostics, labels),
    }
    audit["snapshot_sha256"] = hashlib.sha256(
        json_bytes(
            {
                "audit": audit,
                "diagnostics": diagnostics,
                "events": [{key: str(value) for key, value in row.items()} for row in events],
                "template_sha256": hashlib.sha256(template).hexdigest(),
                "unmatched": unmatched,
                "skipped": skipped,
                "excluded": excluded,
                "golden": sorted(golden),
            }
        )
    ).hexdigest()
    audit["silver"]["signal_retention"] = signal_retention(
        audit["silver"], previous_g0, audit["snapshot_sha256"]
    )
    enforce_silver_gate(audit["silver"])
    report = quality_report(labels, len(events), excluded, unmatched, skipped, golden, len(diy_rows), audit)
    outputs = {
        "labels.parquet": buffer.getvalue(),
        "labels_qc.md": report.encode("utf-8"),
        "diy_labels_template.csv": template,
        "labels_g0.json": json_bytes(audit),
    }

    # 사람이 편집한 입력이나 다른 빌드의 비교 기준을 덮어쓰지 않는다.
    current = template_path.read_bytes() if template_path.exists() else None
    if previous != current:
        raise ValueError("빌드 도중 DIY 템플릿이 변경됐습니다; 저장하지 않고 재실행을 기다립니다")
    if previous_g0_bytes != (g0_path.read_bytes() if g0_path.exists() else None):
        raise ValueError("빌드 도중 labels_g0.json이 변경됐습니다; 저장하지 않고 재실행을 기다립니다")
    for name, content in outputs.items():
        atomic_write(paths.PROCESSED / name, content)
    return {
        "rows": labels.height,
        "sha256": {name: hashlib.sha256(raw).hexdigest() for name, raw in outputs.items()},
    }


# 입력·스키마 실패는 종료 코드 1로 반환해 후속 학습이 실패를 성공으로 오인하지 않게 한다.
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--golden-file", type=Path, help="평가 전용 event_id JSON 배열")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(build(args.golden_file), ensure_ascii=False, sort_keys=True))
    except (
        ValueError,
        TypeError,
        KeyError,
        OSError,
        pa.errors.SchemaError,
        pa.errors.SchemaErrors,
        pl.exceptions.PolarsError,
    ) as exc:
        print(f"라벨 빌드 실패: {type(exc).__name__}: {exc}")
        return 1
    return 0


# 모듈 실행에서 검증 실패 종료 코드를 셸에 전달한다.
if __name__ == "__main__":
    raise SystemExit(main())
