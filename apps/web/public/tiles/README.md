# 지도 타일 (PMTiles)

전국 판·동네 3D가 읽는 벡터 지도 타일이다. 저장소에는 GitHub 파일 크기 제한(100MB) 안에 드는 잘라 낸 파일만 넣었다.

| 파일 | 크기 | 쓰는 곳 | 내용 |
|------|------|---------|------|
| `korea-z8.pmtiles` | 3.7MB | 전국 판 바탕 지도 | 한국 z0~8(토지 피복·호수·도로, 화면은 z7만 읽음) |
| `korea-z15-festivals.pmtiles` | 37MB | 동네 3D·예보서 행사장 | z15, 시군구 중심 252곳과 행사 좌표 211건 둘레 ±1.7km(건물·길·녹지·역) |
| `venue-hangang-z15.pmtiles` 외 2개 | 각 3MB | 시범 행사장 3곳 | z15 행사장 둘레 |

- 출처: [Protomaps](https://protomaps.com) 기본 지도(OpenStreetMap 기반). 지도 자료 © OpenStreetMap contributors, ODbL 1.0.
- 위 범위 밖 좌표(예: 내 행사에 새로 넣은 장소)의 동네 3D는 전국 z15 원본 `korea-z15.pmtiles`(685MB, 저장소 제외)가 이 폴더에 있을 때만 그려진다. 없으면 빈 동네로 보인다.

## 다시 만드는 법

[pmtiles CLI](https://github.com/protomaps/go-pmtiles)로 원본에서 잘라 낸다.

```bash
# 전국 판: z0~8
pmtiles extract korea-z13.pmtiles korea-z8.pmtiles --maxzoom=8
# 동네 3D: 행사·시군구 중심 둘레(한 변 3.4km 정사각 묶음 GeoJSON)의 z15만
pmtiles extract korea-z15.pmtiles korea-z15-festivals.pmtiles --minzoom=15 --maxzoom=15 --region=region-festivals.geojson
```
