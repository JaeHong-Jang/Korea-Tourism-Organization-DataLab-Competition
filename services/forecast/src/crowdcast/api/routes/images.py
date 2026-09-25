"""행사 대표 이미지를 외부 호출 없이 로컬 캐시에서 그대로 제공한다."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from crowdcast.data.image_cache import available_index, cache_directory, cached_image

router = APIRouter()


# 목록과 같은 파일 확인을 거치고 하루 동안 재사용할 수 있는 캐시 헤더를 붙인다.
@router.get("/v1/images/{eventId}")
def image(eventId: str) -> FileResponse:
    directory = cache_directory()
    cached = cached_image(directory, available_index(directory), eventId)
    if cached is None:
        raise HTTPException(404, "대표 이미지 캐시가 없습니다")
    return FileResponse(cached.path, media_type=cached.content_type,
                        headers={"Cache-Control": "max-age=86400"})
