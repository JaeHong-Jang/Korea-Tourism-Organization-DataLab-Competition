# 대한민국 고도 자료

Mapzen Terrain Tiles의 공개 AWS Terrarium z8 타일 56개를 한국 지도와 같은 횡메르카토르 좌표의 500m 격자로 보간했습니다. 음수 고도는 해수면으로 제한하고 정수 미터로 저장했습니다. 화면의 높이 강조는 원본 파일을 바꾸지 않고 렌더링 단계에서 1.6배 적용합니다.

출처: https://registry.opendata.aws/terrain-tiles/
공급자·라이선스 안내: https://github.com/tilezen/joerd/blob/master/docs/attribution.md
한국 영역의 전 지구 원자료: USGS SRTM 및 GMTED2010, NOAA ETOPO1. 가공 결과는 원자료 제공자의 승인이나 보증을 뜻하지 않습니다.

USGS 지형 자료 제공에 감사를 표합니다. NOAA ETOPO1 출처: DOC/NOAA/NESDIS/NCEI, National Centers for Environmental Information, NESDIS, NOAA, U.S. Department of Commerce.

재생성: 저장소 루트에서 `node scripts/terrain/prepare-korea.mjs`. 기존 Playwright와 Edge를 이용해 PNG를 읽으며 추가 패키지와 API 키는 필요하지 않습니다. 다운로드 날짜와 격자 범위는 `korea-height.json`에 기록됩니다.

전국 지형은 성긴 삼각형으로, 확대 영역은 화면 범위 내에서 더 촘촘한 삼각형으로 표현합니다. 확대해도 원본 고도 자료 자체의 해상도가 높아지지는 않습니다. 개별 절벽·제방·교량·터널의 높이를 재현하는 자료가 아닙니다. 바다 밖이나 파일 로딩 실패 시 평면으로 대체하고 화면에 상태를 표시합니다.
