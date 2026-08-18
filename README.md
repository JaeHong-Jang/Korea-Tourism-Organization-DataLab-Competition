# 🏖️ 한국관광공사 데이터랩 활용 경진대회

한국관광공사 데이터랩 데이터를 활용한 관광 데이터 분석 프로젝트

## 📁 프로젝트 구조

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

## 🚀 시작하기

### 1. 저장소 클론
```bash
git clone https://github.com/JaeHong-Jang/Korea-Tourism-Organization-DataLab-Competition.git
cd Korea-Tourism-Organization-DataLab-Competition
```

### 2. 가상환경 설정
```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux/Mac
source .venv/bin/activate
```

### 3. 의존성 설치
```bash
pip install -r requirements.txt
```

### 4. 데이터 준비
- `data/raw/README.md`의 안내에 따라 데이터를 다운로드하세요

## 🤝 협업 방법

자세한 내용은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

### 핵심 규칙
- **`main` 브랜치에 직접 push 금지** — PR로만 병합
- **작업 시작 전** `develop`에서 최신 코드 pull
- **브랜치 네이밍**: `<타입>/<이름>-<설명>` (예: `feat/jaehong-eda`)
- **커밋 메시지**: `<타입>(<범위>): <설명>` (예: `feat(analysis): 월별 추이 분석`)
- **데이터 파일은 Git에 올리지 않음**

## 👥 팀원

| 이름 | 역할 | GitHub |
|------|------|--------|
| 장재홍 | - | [@JaeHong-Jang](https://github.com/JaeHong-Jang) |

## 📄 라이선스

이 프로젝트는 교육 및 경진대회 목적으로 제작되었습니다.
