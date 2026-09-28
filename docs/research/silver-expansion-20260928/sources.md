# 실버 표본 확장: 논문·실무 근거

확인일: 2026-09-28. 원문 논문, 저자 공개 자료, 공식 라이브러리 문서, 저자 집필 교재, NIST 공학 통계 안내서를 확인했다. 블로그·검색 요약만으로 방법론을 결정하지 않았다. 직접 인용 대신 핵심을 요약하고 이 프로젝트에 대한 해석과 한계를 분리했다.

## R1. 강한 관측 결과만 고를 때의 편향

- Gelman, A., & Carlin, J. (2014). *Beyond Power Calculations: Assessing Type S (Sign) and Type M (Magnitude) Errors*. Perspectives on Psychological Science, 9(6), 641–651.
- DOI: [10.1177/1745691614551642](https://journals.sagepub.com/doi/10.1177/1745691614551642).
- [저자 공개 원문](https://stat.columbia.edu/~gelman/research/published/retropower_final.pdf).
- 연구 내용: 작은 표본과 큰 잡음에서 통계적 유의성을 기준으로 선택한 결과가 효과의 크기를 과장하거나 부호를 틀릴 수 있음을 분석한다.
- 적용 해석: 큰 양의 SNR만 남기는 표본 선택이 약한 변화와 음수를 배제한다는 점을 검토하는 근거다. 현재 SNR의 σ는 표준오차가 아니므로 논문의 검정통계량과 동일하다고 해석하지 않는다. 이 축제 모델의 과대예측 원인을 연구가 직접 입증한 것은 아니다.

## R2. 행을 버리지 않는 강건 회귀

- scikit-learn 공식 문서: [HuberRegressor](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.HuberRegressor.html).
- 실무 구현: 작은 잔차에는 제곱 손실, 큰 잔차에는 절대 손실을 적용하며 큰 잔차가 학습을 지배하는 현상을 완화한다. 영향 자체를 완전히 제거하지 않는다.
- 적용 해석: 순증이 크거나 작다는 이유만으로 행을 지우는 대신 손실함수로 영향을 조절하는 비교 후보다. 음수 방문 순증도 회귀 타깃으로 처리할 수 있다.
- 한계: Huber가 시군구 순증을 행사장 참석자 수로 바꾸거나 명절·계절 교란을 제거하지는 않는다. 입력 스케일링·하이퍼파라미터도 학습 구간에서 정해야 한다.

## R3. 측정 정밀도에 따른 가중회귀와 추정 가중치의 한계

- NIST/SEMATECH e-Handbook of Statistical Methods: [Weighted Least Squares Regression, §4.1.4.3](https://www.itl.nist.gov/div898/handbook/pmd/section1/pmd143.htm).
- 수식 설명: [§4.4.3.2 Weighted Least Squares](https://www.itl.nist.gov/div898/handbook/pmd/section4/pmd432.htm).
- 실무 내용: 관측별 정밀도가 다른 경우 가중회귀를 사용한다. 오차분산의 역수 가중치에는 이론적 조건이 있으며, 소수 반복 측정에서 추정한 가중치는 분석을 불안정하게 만들 수 있다. 안내서는 반도체 측정 사례를 제시한다.
- 적용 해석: ‘큰 SNR일수록 정답에 가깝다’는 가중치를 자동 채택하지 않는다. 우선 관측 구간당 동일 가중치로 시작하고, 정밀도를 별도로 추정할 수 있을 때만 제한한 가중치와 비교한다.
- 한계: 평시 지역 변동 σ²는 현재 라벨의 측정오차분산과 동일하다고 검증되지 않았다. 가중최소제곱의 최적성은 모든 분위수·트리 모델에 그대로 적용되는 주장이 아니다.

## R4. Google의 반사실 시계열 추정

- Brodersen, K. H., Gallusser, F., Koehler, J., Remy, N., & Scott, S. L. (2015). *Inferring causal impact using Bayesian structural time-series models*. Annals of Applied Statistics, 9(1), 247–274.
- [논문](https://arxiv.org/abs/1506.00356), DOI: [10.1214/14-AOAS788](https://doi.org/10.1214/14-AOAS788).
- [Google CausalImpact 공식 설명·예시](https://google.github.io/CausalImpact/CausalImpact.html).
- 연구·실무 내용: 개입이 없었을 시계열을 추정하고 실제 관측과 차이를 계산한다. 공식 도구는 광고 이후 일간 클릭 증가 등 개입 분석을 설명한다. 통제 시계열이 개입에 영향받지 않고 사전 관계가 유지된다는 가정이 필요하다. 가상 개입 시점으로 기준선 예측을 확인하는 방법도 제시한다.
- 적용 해석: 평시 대비 변화량과 실제 참석자 수를 구분한다. 장기적으로 대조 지역·계절성을 이용한 기준선을 검토할 수 있다.
- 한계: 인근 지역은 축제 방문의 이동·대체 영향이 있을 수 있다. 주변 지역이라는 이유만으로 유효한 통제군이 되지 않는다. 현재 28일 중앙값 차이는 이 논문의 인과추정 절차를 구현한 것이 아니다.

## R5. 잡음분산에 따른 회귀 가중치 연구

- Mai, V., Khamies, W., & Paull, L. (2021). *Batch Inverse-Variance Weighting: Deep Heteroscedastic Regression*.
- [저자 원문 PDF](https://www.gatsby.ucl.ac.uk/~balaji/udl2021/accepted-papers/UDL2021-paper-043.pdf).
- 확인한 판본: ICML 2021 Workshop on Uncertainty and Robustness in Deep Learning 발표 논문. 본회의 논문이나 별도 ICLR 논문으로 소개하지 않는다.
- 연구 내용: 라벨별 잡음분산 추정치를 이용하는 신경망 회귀의 가중 손실을 다룬다. 매우 작은 분산이 일부 표본의 가중치를 지배하지 않도록 안정화하며 필터 방식과 비교한다.
- 적용 해석: 잡음 자료를 무조건 버리는 것 외에 측정 불확실성을 반영하는 방법이 존재한다는 근거다.
- 한계: 잡음분산 추정치를 확보했다는 가정이 핵심이다. SNR별 1·0.5·0.25라는 값을 제안하는 논문이 아니며, 이 데이터에 그대로 가져와 성능 개선을 보장할 수 없다. 따라서 이번 기본안은 이 가중치를 구현하지 않는다.

## R6. 사용할 수 있는 트리 회귀 손실

- LightGBM 공식 문서: [Parameters — objective](https://lightgbm.readthedocs.io/en/stable/Parameters.html#objective).
- 구현 내용: `regression_l1`, `huber`, `quantile` 등의 회귀 목적함수를 제공한다.
- 적용 해석: 현재 사용 중인 도구 안에서 부호 있는 연속 타깃의 중앙값·분위수를 학습하는 작은 실험을 만들 수 있다. 음수를 처리하기 위해 임의의 0 치환이나 로그 정답을 유지할 필요가 없다.
- 한계: 공식 문서는 이 행사 데이터에서 어느 손실이 가장 좋은지 정하지 않는다. num_leaves·최소 잎 표본·보정 크기는 프로젝트에서 사전 정한 후보를 과거 개발 구간으로 비교해야 한다.

## R7. 시간순으로 늘리는 검증

- Hyndman, R. J., & Athanasopoulos, G. (2021). *Forecasting: Principles and Practice*, 3rd ed., §5.10.
- [Time series cross-validation](https://otexts.com/fpp3/tscv.html).
- 방법: 예측 대상보다 앞선 관측만 학습에 사용하는 rolling forecasting origin을 설명한다. 학습 오차와 실제 미래 예측오차를 구분한다.
- 적용 해석: 매번 직전 1년 전체를 보정용으로 제외하는 분할 대신 월별로 과거 학습 후보를 늘리는 방안을 비교한다. 이 프로젝트에서는 관측 날짜에 더해 실제 공개일 조건을 적용한다.
- 한계: 월별 개최 행사는 등간격 시계열이 아니므로 행 번호만으로 TimeSeriesSplit을 호출하지 않는다. 날짜·공개일·지역 겹침 군집을 명시적으로 검사한다.

## R8. 음수·0 근처 타깃의 평가

- Hyndman & Athanasopoulos (2021), 같은 교재 §5.8.
- [Evaluating point forecast accuracy](https://otexts.com/fpp3/accuracy.html).
- 방법: 실제값이 0이거나 0에 가까우면 비율 오차가 정의되지 않거나 극단적으로 커질 수 있다. 같은 단위에서는 MAE와 RMSE로 비교할 수 있다. MAE 최소화의 대표값은 중앙값이다.
- 적용 해석: signed 순증에서는 MAE를 주 지표로 쓰고, 평균 오차·RMSE·분위수 손실·부분집합 성적을 보완한다.
- 한계: 큰 지역의 절대오차가 커질 수 있으므로 지역별·규모별 성적도 같이 본다. 새 MAE와 기존 양수 선별 MdAPE의 숫자를 직접 비교하지 않는다.

## R9. 시계열의 예측구간

- Zaffran, M., Féron, O., Goude, Y., Josse, J., & Dieuleveut, A. (2022). *Adaptive Conformal Predictions for Time Series*. ICML, PMLR 162, 25834–25866.
- [논문·원문·서지](https://proceedings.mlr.press/v162/zaffran22a.html).
- 연구 내용: 일반적인 conformal prediction의 교환가능성 조건이 시계열에서 성립하기 어렵다는 문제를 다루며 시간 의존성에 대응하는 방법을 연구한다. 전력 가격 예측 사례를 포함한다.
- 적용 해석: 시간순 보정·평가를 유지하고 목표 80% 구간의 실제 포함률과 폭을 보고한다.
- 한계: 이번 설계는 논문의 AgACI 구현을 채택한 것이 아니다. 단순 CQR에 시계열에서도 무조건 80%를 보장한다는 설명을 붙이지 않는 근거로 사용한다.

## R10. 행사 참석자 추정에는 공간·시간 정의와 실측 대조가 필요

- Mamei, M., & Colonna, M. (2015 공개 원고; 2016 학술지 게재). *Estimating Attendance From Cellular Network Data*.
- [저자 원고](https://arxiv.org/abs/1504.07385), [저자 소속기관의 게재 기록](https://iris.unimore.it/handle/11380/1116631).
- 연구 내용: 행사 위치에 대응하는 통신 셀, 행사 시간과 평시의 이용 패턴으로 참석자를 추정하고 확보 가능한 실제 참석자 수와 대조한다. 경기장 경기·공연·광장 축제 등의 사례를 포함한다.
- 적용 해석: 시군구 일간 순증을 행사장 참석자 수와 같은 라벨로 합치려면 별도 공간·시간 연결과 검증이 필요하다.
- 한계: 이 연구의 개인 단위 익명 CDR 해상도는 현재 시군구 집계와 다르다. 논문에서 보고된 정확도를 우리 데이터의 예상 성적으로 전용하지 않는다.

## R11. 분위수 회귀 결과의 구간 보정

- Romano, Y., Patterson, E., & Candès, E. J. (2019). *Conformalized Quantile Regression*.
- [저자 원고·서지](https://arxiv.org/abs/1905.03222).
- 연구 내용: 분위수 회귀로 조건별 폭이 다른 구간을 만들고 별도 보정 자료로 조정하는 방법을 제안한다.
- 적용 해석: p10·p90 예측을 보정 전용 과거 자료의 구간 이탈 점수로 조정하는 근거로 사용한다.
- 한계: 본 프로젝트의 1/k 중복 가중치, 보정 점수의 0 하한, 가중 경험 80% 분위수는 별도로 정한 운용 규칙이다. 시계열 자료에 이 규칙을 적용했다고 논문의 유한 표본 포함률 보장이 자동으로 성립하지 않는다. 실제 포함률과 폭을 평가한다.

## 프로젝트 자체 제안과 연구 사실의 구분

SNR 필터 해제, 중복 관측 1/k, 2024 개발·2025 비교·2026 추가 검증, 월별 재학습, 20% 보정, 최소 50/100 군집, LightGBM 파라미터 후보는 **위 근거와 현 데이터의 한계를 고려한 프로젝트 설계 제안**이다. 특정 논문이 이 수치를 표준으로 규정하거나 본 프로젝트에서 유효하다고 입증한 것은 아니다.

이 문헌 정리 시점에는 조사·집계만 완료했다. 이후 사용자의 승인으로 동일 평가셋 비교를 실행했으며, 실제 성능과 한계는 [실험 결과](results.md)에 별도로 기록했다.
