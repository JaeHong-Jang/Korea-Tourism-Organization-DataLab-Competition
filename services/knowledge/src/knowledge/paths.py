"""근거 그래프 서비스 경로 — 계약 파일과 저장소(CROWDCAST_DATA_ROOT) 위치(오케스트레이터 소유)."""
import os
from pathlib import Path

from dotenv import load_dotenv

# 레포 루트: services/knowledge/src/knowledge/paths.py에서 네 단계 위
REPO_ROOT = Path(__file__).resolve().parents[4]

# .env(워크트리에서는 본 레포 .env로 링크)를 읽는다 — 이미 있는 환경 변수가 우선
load_dotenv(REPO_ROOT / ".env", override=False)

# 데이터 루트: 설정돼 있으면 그곳(본 레포), 없으면 이 레포
DATA_ROOT = Path(os.environ.get("CROWDCAST_DATA_ROOT") or REPO_ROOT)

# 계약(JSON-LD 컨텍스트·타입 규칙·기준 id·픽스처) — git이 추적하므로 워크트리 안의 것을 쓴다
CONTRACTS = REPO_ROOT / "packages" / "contracts"
JSONLD = CONTRACTS / "jsonld"

# 온톨로지·기준 그래프·SHACL·질의(이 서비스 안)
ONTOLOGY = REPO_ROOT / "services" / "knowledge" / "ontology"

# Oxigraph 저장소(쓰는 곳)
STORE = DATA_ROOT / "data" / "app" / "knowledge"
