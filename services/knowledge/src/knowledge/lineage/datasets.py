"""출처가 알려진 자료 경로만 계약의 기준 데이터셋 식별자에 연결한다."""

import orjson
from knowledge.paths import JSONLD
from knowledge.store.repository import ID
from rdflib import URIRef

# 데이터 신청 안내의 원본 보관 위치와 단일 출처 정제표만 대응한다.
EXACT_SOURCES = {
    "data/processed/region_daily.parquet": "ds-kto-visitors-15101972",
    "data/processed/mcst_festivals.parquet": "ds-mcst-festival-plans",
    "data/external/boundaries/sigungu.topo.json": "ds-admdongkor-boundaries",
}
SOURCE_FOLDERS = {
    "data/raw/mcst/": "ds-mcst-festival-plans",
    "data/raw/datalab/festival/": "ds-datalab-festival-status",
    "data/raw/datalab/diy/": "ds-datalab-diy",
    "data/raw/datalab/bda_visitors/": "ds-kto-visitors-15101972",
    "data/raw/datalab/bda_navi/": "ds-datalab-navi-search",
    "data/raw/datalab/bda_poi_rank/": "ds-datalab-poi-rank",
    "data/raw/datalab/area/": "ds-datalab-region-status",
}


# 혼합 출처 표나 알 수 없는 파일명에는 데이터셋을 추측해 붙이지 않는다.
def dataset_for_path(path: str) -> URIRef | None:
    dataset = EXACT_SOURCES.get(path)
    if dataset is None:
        dataset = next((value for folder, value in SOURCE_FOLDERS.items() if path.startswith(folder)), None)
    if dataset is None:
        return None
    if dataset not in orjson.loads((JSONLD / "master-ids.json").read_bytes())["datasets"]:
        raise ValueError(f"계약에 없는 데이터셋: {dataset}")
    return ID[dataset]
