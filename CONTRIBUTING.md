# 🤝 협업 가이드 (Contributing Guide)

## 브랜치 전략

### 브랜치 구조
```
main                  ← 최종 제출용 (직접 push 금지)
├── develop           ← 통합 개발 브랜치 (PR로만 병합)
│   ├── feat/분석주제  ← 새로운 분석/피처
│   ├── fix/버그설명   ← 버그 수정
│   ├── data/작업설명  ← 데이터 전처리
│   ├── model/모델명   ← 모델 실험
│   ├── viz/시각화설명  ← 시각화 작업
│   └── docs/문서설명  ← 문서 작업
```

### 브랜치 네이밍 규칙
```
<타입>/<이름>-<간단한설명>

예시:
feat/jaehong-tourism-trend-analysis
model/jaehong-xgboost-baseline
data/jaehong-visitor-preprocessing
fix/jaehong-missing-value-handling
viz/jaehong-monthly-chart
docs/jaehong-readme-update
```

## 커밋 메시지 규칙

### 형식
```
<타입>(<범위>): <한글 설명>

[선택] 본문: 변경 이유 및 상세 내용
[선택] 꼬리말: 관련 이슈 번호
```

### 타입
| 타입 | 설명 | 예시 |
|------|------|------|
| `feat` | 새로운 분석/기능 추가 | `feat(analysis): 월별 방문객 추이 분석 추가` |
| `fix` | 버그 수정 | `fix(data): 결측치 처리 로직 오류 수정` |
| `data` | 데이터 전처리/수집 | `data(raw): 2024년 관광객 데이터 전처리` |
| `model` | 모델 관련 변경 | `model(xgb): 하이퍼파라미터 튜닝` |
| `viz` | 시각화 추가/수정 | `viz(chart): 지역별 관광객 히트맵 추가` |
| `docs` | 문서 작성/수정 | `docs(readme): 프로젝트 설명 업데이트` |
| `refactor` | 코드 리팩토링 | `refactor(utils): 데이터 로딩 함수 정리` |
| `chore` | 환경설정/기타 | `chore(deps): pandas 버전 업데이트` |
| `test` | 테스트 추가/수정 | `test(model): 모델 성능 검증 테스트 추가` |

### ⚠️ 커밋 전 체크리스트
- [ ] 큰 데이터 파일이 포함되지 않았는지 확인 (`.gitignore` 확인)
- [ ] 노트북 출력(output)을 clear 했는지 확인
- [ ] API 키나 개인정보가 포함되지 않았는지 확인
- [ ] 코드가 정상 실행되는지 확인

## Pull Request 규칙

### PR 생성 절차
1. 본인 브랜치에서 작업 완료
2. `develop` 브랜치로 PR 생성
3. PR 템플릿에 맞춰 설명 작성
4. **최소 1명** 팀원 리뷰 후 병합
5. 병합 후 작업 브랜치 삭제

### PR 제목 형식
```
[타입] 간단한 설명

예시:
[feat] 월별 관광객 추이 분석 추가
[model] XGBoost 베이스라인 모델 구현
[data] 방문자 데이터 전처리 파이프라인
```

## 충돌(Conflict) 방지 규칙

### 🚨 반드시 지켜야 할 것
1. **작업 시작 전** 항상 최신 develop를 pull 받는다
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feat/내이름-작업설명
   ```

2. **파일 담당 구역을 나눈다** — 같은 파일을 동시에 수정하지 않는다
   - 각자 담당 노트북/스크립트를 명확히 분리
   - 공용 유틸리티(`src/utils/`)는 수정 전 팀원에게 알림

3. **자주 커밋, 자주 푸시** — 작업 단위를 작게 유지한다

4. **큰 리팩토링은 사전 공유** — 폴더 구조나 공용 코드 변경 시 팀 채널에 먼저 알린다

5. **노트북 충돌 방지**
   - 노트북 파일명에 본인 이름 포함: `01_eda_jaehong.ipynb`
   - 하나의 노트북을 여러 명이 동시에 수정하지 않는다
   - 공유할 분석 결과는 `.py` 스크립트로 분리

### 충돌 발생 시 해결 절차
```bash
# 1. develop 최신화
git fetch origin
git rebase origin/develop

# 2. 충돌 파일 확인 및 수정
# (충돌 마커 <<<< ==== >>>> 를 찾아 해결)

# 3. 해결 후
git add .
git rebase --continue

# 4. 강제 푸시 (본인 브랜치에만!)
git push --force-with-lease origin 본인브랜치
```

> ⚠️ **`main`, `develop` 브랜치에는 절대 `--force` 푸시하지 않는다!**

## 데이터 관리 규칙

1. **원본 데이터**(`data/raw/`)는 Git에 올리지 않는다
   - 팀 공유 드라이브(Google Drive 등)에 별도 관리
   - `data/raw/README.md`에 데이터 출처와 다운로드 방법 기록

2. **전처리된 데이터**도 크기가 크면 Git에 올리지 않는다 (100MB 이상)

3. **샘플 데이터**만 Git에 포함 (재현 가능성을 위해)

## 환경 설정

### 공통 Python 환경
```bash
# 가상환경 생성 및 활성화
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
.venv\Scripts\activate     # Windows

# 의존성 설치
pip install -r requirements.txt

# 새 패키지 추가 시
pip install 패키지명
pip freeze > requirements.txt
```
