# 사전 등록 공개 규칙

등록일: 2026-09-29 (KST). 공개 태그 예정: `prereg-2026-09-29`.
참고용 — 담당자 검토 필수. 순간 최대·환산 판정은 추정 산식 기반.

## 선정
1. T-205 요약·예보는 runId, 행 수, forecastId 집합과 행사·모델·등급이 같아야 한다.
   제외 조건 적용 전 모든 예보에 대해 현재 행사 마스터의 계약 스냅샷으로
   identifier("f", {eventId, asOf, modelVersion, event})를 다시 계산해 JSONL forecast.id와 대조한다.
   asOf·modelVersion은 JSONL 값을 사용하며 위험 요소·시간대를 포함한 전체 행사 조건을 검증한다.
   하나라도 다르면 선정·등록을 거부한다: “T-205 뒤 행사 마스터가 바뀜 — 일괄 예보를 다시 돌리세요”.
2. 시작일 ≥ 등록일 + 3일, 종료일 ≤ 2026-10-31.
3. 시군구 확정, 연속성 단절 없음. 인천 제외 코드: 28110, 28125, 28140, 28155, 28260, 28275, 28290.
4. date_available_at이 있으면 KST 날짜 ≤ 등록일. 없으면 “TourAPI 일정 아님 → 문체부 파일 기준(공개일 미입증)”로 기록한다.
5. 기간 1~14일. T-205에 고정된 공개 평시 기간(최대 28일)에서
   행사에 필요한 요일마다 공휴일을 뺀 완전한 세 방문자 구분의 표본 ≥ 3일.
   등록일까지 공개된 자료만 사용한다. 이 검사는 채점 자료 확보 가능성 확인이다.
   실제 행사 직전 기준선은 API 지연 때문에 등록 시점에 없을 수 있으며 채점 때 다시 계산한다.
6. 등록 시 확인된 취소·연기 0건(선정 입력에 취소 정보 없음) — 이후 확인된 취소·연기는 채점에서 제외하고 공개.
   선정에는 취소 필터를 적용하지 않는다. 조건별 제외는 첫 사유 하나로 센다.
7. 등급 1, 2, 3, 4 순서로 sha256(eventId + "2026-09-29")의
   소문자 16진 해시 오름차순(동점은 eventId)으로 등급당 최대 8건을 우선 선정한다.
   총 20건 미만이면 남은 대상 전체에서 같은 해시순으로 20건까지 보충한다.
   보충에는 등급별 상한을 적용하지 않는다. 부족하면 있는 만큼과 사유를 공개한다.
   층화 선정 순서 뒤에 보충 순서를 잇는다. 등급별 수와 편중을 숨기지 않는다.

## 등록 준비와 고정
외부 피처 공개 시점은 개최 D-14 이하, 행사 속성은 요청 입력인 조건부 정의다.
leadDays = 한국 개최일 − 등록일. 리드타임별 결과는 채점 항목의 leadDays로 구분한다.
JSONL의 SHA-256·runId·모델 버전·검증 상태와 행사 스냅샷을 준비본 메타에 보존한다.
예보 수치는 JSONL에서 그대로 복사하며 재추론하지 않는다. 같은 입력은 같은 바이트다.
기본 register/--dry-run은 data/processed/prereg_payloads.json에만 쓰고 통신하지 않는다.
테스트는 임시 경로만 쓰고 선정·dry-run의 공개 산출물은 RULES.md뿐이다.
--send는 매 POST 직전에 KST 등록일을 검사하며 자정을 넘으면 남은 전송을 중단한다.
이미 등록된 예보·미전송 예보·응답 확인이 필요한 예보는 data/processed/prereg_send_status.json에 기록한다.
--send 전체 성공 때만 reports/preregistered/2026-09-29-meta.json를 생성한다.
공개 메타에는 준비본 파일 SHA-256·JSONL SHA-256·runId·모델 버전·검증 상태·선정 eventId·forecastId를 고정한다.
현 원장 계약은 메타를 해시 체인에 넣지 못한다. 오케스트레이터가 공개 메타를 공개 커밋·태그에 함께 고정한다.

## 채점
API 반영 약 31일: 10월 종료 행사는 자료 공개 뒤 11월 채점한다. 대회에서는 절차·일정을 제시한다.
원장 항목의 숫자를 기준으로 T-103 crowdcast.labels.silver.build_silver를 그대로 호출한다.
로컬 준비본 전체 바이트의 SHA-256이 공개 메타와 같을 때만 채점한다. 메타 누락·불일치는 거부한다.
원장 forecastId 집합은 준비본·공개 메타의 전체 집합과 같아야 한다. 빈 원장·일부 누락·추가도 거부한다.
등록 준비본·공개 메타·원장이 모두 없을 때만 등록 전 0건 응답을 허용한다.
실측 = 행사 기간 날마다 (시군구 방문 − 행사 시작 전 28일 같은 요일 중앙값)의 평균.
기준선은 KR 공휴일 제외·필요 요일별 ≥ 3일·잔차 표본 표준편차(ddof=1)다.
기간의 세 방문자 구분이 한 날이라도 누락되면 대기, 취소·연기는 취소다.
취소·연기는 data/processed/prereg_status.json만 사용한다.
형식: [{eventId, status: 취소|연기, source, checkedAt}].
파일이 없으면 빈 목록이다. 빈 출처·시간대 없는 확인 시각·중복 행사 등 잘못된 항목은 채점을 거부한다.
CLI score는 scores와 statusSources(취소·연기 출처·확인 시각)를 함께 출력한다.
현재 API 계약에는 출처 필드가 없어 상태·건수만 반환하며 출처 필드는 계약 확장 후 반영한다.
신호 ≤ 3σ, σ=0, 음수, 명절 겹침 또는 기준선 부적합은 채점 불가다(T-103 품질 판정).
채점 불가·취소는 분모에서 빼고 건수를 공개한다. 대기도 분모에 넣지 않는다.
구간 포함 = p10 ≤ 반올림 전 실버 실측 ≤ p90. 포함 건수/채점 완료 건수를 공개한다.
등급 일치 = 실측을 세 분위수로 반복해 기존 distribution 환산·judge에 넣은 등급과 비교한다.
행사 유형·기간·위험 요소·seed·표본 수·환산 설정은 등록 준비본에 고정하며 변경 시 채점을 거부한다.
백테스트 성적과 사전 등록 성적은 합치지 않는다. 실버는 시군구 순증 추정이며 행사장 직접 실측이 아니다.

## 실행 고지
사용 모델: v1-064e60073a7411037212 / 미검증.
G0: simple (simple=단순 모델), 구간 표시.
백테스트 v1: 평가 86건, 포함 49/86.
사전 등록은 "지금 모델로 낸 예보를 먼저 공개하고 나중에 채점한다"는 약속이지, 모델이 검증됐다는 뜻이 아니다.
선정 20건: 1등급 0건, 2등급 0건, 3등급 0건, 4등급 20건.
등급 편중: 1등급 0건, 2등급 0건, 3등급 0건, 4등급 20건. 부족 사유: 없음.

아래는 문서 재생성용 실행 메타이며 원장 등록 내역이 아니다.
```json
{"metadata":{"backtest":{"covered":49,"evaluated":86},"backtestRunId":"bt-v1-064e60073a7411037212","conversion":{"samples":4000,"seed":2026,"settings":{"judgment":{"interval_display":"표본 한계로 구간 기준 표시 · 순간 최대 {p10:,}~{p90:,}명 · 추정 산식 기반","labels":{"1":"소규모","2":"수립 권고","3":"수립 대상","4":"대규모"},"legal_hazards":["불","폭죽","가연성가스","석유류","산","수면"],"rules":{"rule-check-fire":{"clause_id":null,"conditions":{"hazards":["불","폭죽","가연성가스","석유류"]},"id":"ck-fire","kind":"자체","text":"화기 관리","title":"화기 관리"},"rule-check-night-lighting":{"clause_id":null,"conditions":{"hazards":["야간조명부족"],"timeOfDay":["야간"]},"id":"ck-night-lighting","kind":"자체","text":"야간 조명","title":"야간 조명"},"rule-check-rain-shelter":{"clause_id":null,"conditions":{"at":{"단기예보":3,"중기예보":10,"초단기실황":0},"pop":30,"pty":["비","비/눈","눈","소나기"],"source":["없음"]},"id":"ck-rain-shelter","kind":"자체","text":"우천 시 대피 공간","title":"우천 시 대피 공간"},"rule-check-single-exit":{"clause_id":null,"conditions":{"hazards":["단일출입구"]},"id":"ck-single-exit","kind":"자체","text":"단일 출입구","title":"단일 출입구"},"rule-check-stage-crowd":{"clause_id":null,"conditions":{"hazards":["무대밀집"],"type":["공연"]},"id":"ck-stage-crowd","kind":"자체","text":"무대 앞 밀집","title":"무대 앞 밀집"},"rule-check-vehicle":{"clause_id":null,"conditions":{"hazards":["차량진입"]},"id":"ck-vehicle","kind":"자체","text":"차량 진입·보행 동선 분리","title":"차량 진입·보행 동선 분리"},"rule-check-water-slope":{"clause_id":null,"conditions":{"hazards":["수면","산"]},"id":"ck-water-slope","kind":"자체","text":"수변·경사 구역 안전","title":"수변·경사 구역 안전"},"rule-internal-10pct":{"below_text":"계획 대상 아님(예상) · 규모 외 위험 점검 권장. 참고용 — 담당자 검토 필수","clause_id":null,"interval_text":"경계선 — 안전관리계획 수립을 권고합니다. 참고용 — 담당자 검토 필수","kind":"자체","text":"경계선 — 자체 확률 기준에 따라 안전관리계획 수립을 권고합니다. 참고용 — 담당자 검토 필수","title":"경계선 수립 권고 기준"},"rule-internal-5000":{"checklist":{"id":"ck-traffic","text":"교통·주차 통제 계획과 경찰·소방 사전 협의"},"clause_id":null,"kind":"자체","text":"대상 + 교통·경찰·소방 사전 협의 권고. 자체 대규모 기준이며 참고용 — 담당자 검토 필수","title":"대규모 기준"},"rule-internal-50pct":{"clause_id":null,"interval_text":"자체 기준 — 예측으로는 순간 최대가 법정 인원 기준에 닿을 가능성이 높아 수립 대상으로 봅니다. 참고용 — 담당자 검토 필수","kind":"자체","text":"자체 확률 기준에 따라 순간 최대 예상 인원이 법정 인원 기준에 도달할 가능성이 높습니다. 참고용 — 담당자 검토 필수","title":"수립 대상 가능성 기준"},"rule-legal-1000":{"clause_id":"law-disaster-act-enf-73-9","kind":"법정","text":"순간 최대 예상 인원 기준에 따라 안전관리계획 수립 대상입니다. 참고용 — 담당자 검토 필수","title":"순간 최대 예상 인원 기준"},"rule-legal-hazard":{"clause_id":"law-disaster-act-enf-73-9","kind":"법정","text":"불·폭죽·가연성 물질 사용 또는 산·수면 개최로 인원과 관계없이 안전관리계획 수립 대상입니다. 참고용 — 담당자 검토 필수","title":"인원 무관 위험 요소 기준"}},"thresholds":{"large_crowd":5000,"large_probability":0.5,"legal_crowd":1000,"recommend_probability":0.1,"target_probability":0.5}},"peak":{"peak_day":{"four_or_more_days":1.5,"half_range":0.2,"id":"as-peak-day-factor","one_day":1.0,"two_or_three_days":1.3,"weekend_increment":0.1},"profiles":{"공연":{"id":"as-concurrency-performance","operating_hours":4,"peak_factor":1.2,"stay_hours":3},"기타":{"id":"as-concurrency-other","operating_hours":8,"peak_factor":1.6,"stay_hours":2.5},"꽃":{"id":"as-concurrency-flower","operating_hours":9,"peak_factor":2,"stay_hours":1.5},"대학":{"id":"as-concurrency-university","operating_hours":6,"peak_factor":1.4,"stay_hours":3},"먹거리":{"id":"as-concurrency-food","operating_hours":10,"peak_factor":1.8,"stay_hours":2},"불꽃":{"id":"as-concurrency-fireworks","operating_hours":3,"peak_factor":1.2,"stay_hours":2.5},"전통":{"id":"as-concurrency-traditional","operating_hours":8,"peak_factor":1.6,"stay_hours":2}},"stay_half_range":0.2}}},"eventsSha256":"964f24e441bbf025b0207326a3d097207db83b4ce253b4339262e3a6fbff3391","forecastsSha256":"d6557491bb6b192a9a3c4798919e2894b02fc758b12d216ec2246e974118812f","g0":{"basis":"구간","primary_model":"simple"},"modelVersion":"v1-064e60073a7411037212","promise":"사전 등록은 \"지금 모델로 낸 예보를 먼저 공개하고 나중에 채점한다\"는 약속이지, 모델이 검증됐다는 뜻이 아니다.","regionSha256":"3af83ecabebb649cffdc7e76d9b4d41ec07a430eb5ff0df3b7d728ab3c539779","runId":"batch-23a5de1428a96866a63a627f0ced72f902db972d819ecf74b723ea242fb1e730","summariesSha256":"7b6038d2dd13adcc588bbc0c32e5b63a295395f1232e44e5982449e9b08ce893","verdict":"미검증"},"selection":{"eligible":155,"excluded":[{"eventId":"e-2026-52190-fc824b32db","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-44760-65711ad39c","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-41630-ba924612b1","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-47750-b521ee671c","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-41480-e73a56501b","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-41150-8da76b5c89","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-46840-0647e02f2d","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-51780-4ba6332312","reason":"리드타임 3일 미만"},{"eventId":"e-2026-31110-c4543a1e7e","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-51800-a9f77a0785","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-46860-c512d896f6","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-46830-a85bb90626","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-26200-ad318f0869","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-46800-f5df8af890","reason":"리드타임 3일 미만"},{"eventId":"e-2026-43110-fee3685550","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-48330-dfb92138cb","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-44130-901316d026","reason":"리드타임 3일 미만"},{"eventId":"e-2026-46810-ba9d78f503","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-47900-cb4641fab5","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-41310-8337af1fb4","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-44180-51b6e40638","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-52140-c36a087402","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-52210-0e7f99920b","reason":"리드타임 3일 미만"},{"eventId":"e-2026-48720-1cffc3709b","reason":"리드타임 3일 미만"},{"eventId":"e-2026-41110-eee2939c24","reason":"기간 범위 밖(1~14일)"},{"eventId":"e-2026-27140-a7abf9391f","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-46780-3334857c2f","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-36110-d1508baf9b","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-48310-57325d5c88","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-46840-24b146f896","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-47190-92b99095b7","reason":"리드타임 3일 미만"},{"eventId":"e-2026-44130-576485127c","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-52140-0b9067ab47","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-51110-e71ed650ad","reason":"리드타임 3일 미만"},{"eventId":"e-2026-30200-d7d1e60dfa","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-44800-6f7e3e9a2e","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-48120-b9132a5ea1","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-44825-0a6679b623","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-41480-79819560a3","reason":"리드타임 3일 미만"},{"eventId":"e-2026-44150-1598c8d8ea","reason":"기간 범위 밖(1~14일)"},{"eventId":"e-2026-44825-47d5b1bcda","reason":"리드타임 3일 미만"},{"eventId":"e-2026-47190-e20c595ce6","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-52770-27fd1c03e8","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-48240-12c309c926","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-44200-7bb0a68e92","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-47900-9442fb3961","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-48250-45cef7c81a","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-46730-35b025c06d","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-51770-c40d2beb3c","reason":"리드타임 3일 미만"},{"eventId":"e-2026-30200-4f6e5c02c4","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-51770-788e392b88","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-46130-10a43058c9","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-46820-8bdfa12923","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-48250-d3781529f4","reason":"종료일 2026-10-31 이후"},{"eventId":"e-2026-11680-5130b9826b","reason":"리드타임 3일 미만"},{"eventId":"e-2026-43110-6b68878a11","reason":"종료일 2026-10-31 이후"}],"excludedCounts":{"기간 범위 밖(1~14일)":2,"리드타임 3일 미만":11,"종료일 2026-10-31 이후":43},"filled":12,"imbalance":"1등급 0건, 2등급 0건, 3등급 0건, 4등급 20건","input":211,"levelCounts":{"1":0,"2":0,"3":0,"4":20},"notes":{"TourAPI 일정 아님 → 문체부 파일 기준(공개일 미입증)":211},"selected":20,"shortfallReason":"없음","stratified":8}}
```
