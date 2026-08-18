# 한국관광공사 데이터랩 활용 경진대회

## 프로젝트 개요
한국관광공사 데이터랩 데이터를 활용한 관광 데이터 분석 경진대회 프로젝트

## 디렉토리 구조
```
├── data/
│   ├── raw/              # 원본 데이터 (Git 미포함)
│   ├── processed/        # 전처리된 데이터
│   └── external/         # 외부 데이터
├── notebooks/            # Jupyter 노트북 (EDA, 실험)
├── src/
│   ├── data/             # 데이터 수집/전처리 스크립트
│   ├── features/         # 피처 엔지니어링
│   ├── models/           # 모델 학습/예측
│   ├── visualization/    # 시각화 코드
│   └── utils/            # 공용 유틸리티
├── reports/              # 분석 보고서, 발표 자료
│   └── figures/          # 시각화 결과 이미지
├── models/               # 학습된 모델 파일 (Git 미포함)
├── configs/              # 설정 파일
└── docs/                 # 프로젝트 문서
```

## 코딩 컨벤션
- Python 3.10+
- 함수/변수: snake_case, 클래스: PascalCase
- 한글 주석 사용 권장
- 노트북 파일명: `XX_주제_이름.ipynb` (예: `01_eda_jaehong.ipynb`)
- 스크립트 파일명: snake_case (예: `preprocess_visitor.py`)

## 주요 라이브러리
- pandas, numpy: 데이터 처리
- matplotlib, seaborn, plotly: 시각화
- scikit-learn, xgboost, lightgbm: 모델링
- requests, beautifulsoup4: 데이터 수집

## 브랜치 규칙
- `main`: 최종 제출용 — 직접 push 금지, PR만 허용
- `develop`: 개발 통합 — PR로만 병합
- 작업 브랜치: `<타입>/<이름>-<설명>` (예: `feat/jaehong-eda`)
- 상세 규칙은 CONTRIBUTING.md 참고

## 커밋 메시지
```
<타입>(<범위>): <설명>
예: feat(analysis): 월별 방문객 추이 분석 추가
```

## 데이터 규칙
- 원본 데이터는 Git에 올리지 않음 (.gitignore 적용됨)
- 데이터 출처와 다운로드 방법은 data/raw/README.md에 기록
- 100MB 이상 파일은 Git에 포함하지 않음
