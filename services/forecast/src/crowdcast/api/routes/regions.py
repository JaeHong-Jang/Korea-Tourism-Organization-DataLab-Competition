"""시군구 TopoJSON 원본을 출처·캐시 헤더와 함께 제공한다."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from crowdcast import paths

router = APIRouter()


# 경계 자료는 변환하지 않고 그대로 보내며 없으면 일시적 자료 부재로 알린다.
@router.get("/v1/regions/topojson")
def regions() -> FileResponse:
    file = paths.EXTERNAL / "boundaries/sigungu.topo.json"
    if not file.is_file():
        raise HTTPException(503, "시군구 경계 자료가 없습니다")
    return FileResponse(file, media_type="application/json", headers={
        "Cache-Control": "public, max-age=86400", "X-Attribution": "CC BY 4.0 admdongkor",
    })
