"""데이터·모델·산출물 경로 — CROWDCAST_DATA_ROOT로 본 레포 data/·models/를 쓴다(오케스트레이터 소유)."""
import os
from pathlib import Path

from dotenv import load_dotenv

# 레포 루트: services/forecast/src/crowdcast/paths.py에서 네 단계 위
REPO_ROOT = Path(__file__).resolve().parents[4]

# .env(워크트리에서는 본 레포 .env로 링크)를 읽는다 — 이미 있는 환경 변수가 우선
load_dotenv(REPO_ROOT / ".env", override=False)

# 데이터 루트: 설정돼 있으면 그곳(본 레포), 없으면 이 레포
DATA_ROOT = Path(os.environ.get("CROWDCAST_DATA_ROOT") or REPO_ROOT)

# 원본(읽기 전용): 연도별 문체부 xlsx·데이터랩 CSV·경계 파일
DATA = DATA_ROOT / "data"
EXTERNAL = DATA / "external"

# 쓰는 곳(워커 샌드박스에 쓰기로 열린 폴더): 전처리 결과·API 캐시·앱 저장소·모델
PROCESSED = DATA / "processed"
CACHE = DATA / "cache"
APP = DATA / "app"
MODELS = DATA_ROOT / "models"

# 실행 기록·평가·그림(워크트리에서는 본 레포로 링크)
REPORTS = REPO_ROOT / "reports"
