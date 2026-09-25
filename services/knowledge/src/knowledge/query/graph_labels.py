"""전체 근거 지도의 식별자와 온톨로지 관계를 한국어로 표시한다."""

from knowledge.store.repository import CC, ID
from rdflib import Graph, Literal, URIRef
from rdflib.namespace import DCAT, DCTERMS, OWL, PROV, RDF, RDFS

# 저장소 직렬화가 임의의 ns 접두사를 붙여도 공개 식별자는 변하지 않는다.
PREFIXES = {
    "cc": str(CC),
    "prov": str(PROV),
    "rdf": str(RDF),
    "rdfs": str(RDFS),
    "dcterms": str(DCTERMS),
    "owl": str(OWL),
    "dcat": str(DCAT),
    "schema": "https://schema.org/",
    "cito": "http://purl.org/spar/cito/",
}
PROV_CLASSES = {PROV.Entity: "계보 자료", PROV.Activity: "계보 작업", PROV.Agent: "계보 주체"}
STAGES = {
    "fetch": "자료 수집",
    "labels": "정답 구성",
    "features": "피처 구성",
    "train": "모델 학습",
    "backtest": "백테스트",
    "batch": "일괄 예보",
    "publish": "예보 발행",
}
RELATIONS = {
    "rdf:type": "종류",
    "rdfs:subClassOf": "상위 종류",
    "cc:heldAt": "개최 장소",
    "cc:inRegion": "개최 시군구",
    "cc:predictedFor": "예보 대상",
    "cc:hasObservation": "관측값",
    "cc:dailyMean": "일평균 방문객",
    "cc:peakConcurrent": "순간 최대",
    "cc:dependsOnAssumption": "환산 가정",
    "cc:usesAssumption": "사용 가정",
    "cc:hasFactor": "예측 요인",
    "cc:judgedBy": "판정 규칙",
    "cc:basedOnClause": "근거 조항",
    "cc:basedOn": "근거",
    "cc:aboutRule": "대상 규칙",
    "cc:aboutAssumption": "대상 가정",
    "cc:aboutCase": "대상 사례",
    "cc:aboutForecast": "대상 예보",
    "cc:aboutRegion": "대상 시군구",
    "cc:mentionsClause": "참조 조항",
    "cc:derivedFromDataset": "데이터 출처",
    "cc:hasJudgment": "판정",
    "cc:hasReason": "판정 사유",
    "cc:reasonRule": "사유 규칙",
    "cc:reasonClause": "사유 조항",
    "cc:reasonEvidence": "사유 근거",
    "cc:hasChecklistItem": "체크리스트",
    "cc:checklistRule": "점검 규칙",
    "cc:supportedBy": "뒷받침 근거",
    "cc:probabilityOver": "임계값별 확률",
    "cc:hasPlaceholder": "수치 자리표시자",
    "cc:quantity": "수치",
    "cc:inSession": "소속 세션",
    "cc:checkedBy": "검사 결과",
    "cc:checkResult": "검증 결과",
    "cc:statesQuantity": "설명 수치",
    "cc:hasEvidence": "근거",
    "cc:hasClaim": "발행 문장",
    "cc:hasSimilarCase": "유사 행사",
    "cc:measured": "실측 수치",
    "cc:announced": "발표 수치",
    "cc:hasBaseline": "개최지 평시",
    "cc:weekdayMean": "요일별 평균",
    "cc:aboutEvent": "대상 행사",
    "cc:reportOf": "예보서 대상",
    "cc:expectedByHost": "주최 측 예상",
    "cc:hasStage": "실행 단계",
    "cc:trainRange": "학습 기간",
    "cc:period": "기간",
    "cito:citesAsEvidence": "인용 근거",
    "prov:used": "사용",
    "prov:wasGeneratedBy": "생성 작업",
    "prov:wasDerivedFrom": "파생 출처",
    "prov:wasInformedBy": "선행 작업",
    "prov:wasAssociatedWith": "수행 주체",
    "prov:wasAttributedTo": "귀속 주체",
}


# 알려진 어휘만 CURIE로 바꾸고 낯선 술어는 임의 접두사를 만들지 않는다.
def curie(term: URIRef) -> str:
    for prefix, namespace in PREFIXES.items():
        if str(term).startswith(namespace):
            return f"{prefix}:{str(term).removeprefix(namespace)}"
    raise ValueError(f"전체 근거 지도에 등록되지 않은 어휘: {term}")


# 기준 개체는 계약의 평면 id, 클래스는 어휘 CURIE를 쓴다.
def node_id(term: URIRef) -> str:
    if str(term).startswith(str(ID)):
        return str(term).removeprefix(str(ID))
    return curie(term)


# 다국어·다중 값의 순서와 무관하게 한국어 리터럴을 우선한다.
def literal_text(graph: Graph, subject: URIRef, predicate: URIRef) -> str:
    values = [value for value in graph.objects(subject, predicate) if isinstance(value, Literal)]
    values.sort(key=lambda value: (value.language != "ko", str(value), value.language or ""))
    return str(values[0]) if values else ""


# 정본에 관계 라벨이 생기면 우선 사용하고 현재 무라벨 관계에는 한국어 사전을 쓴다.
def relation_label(tbox: Graph, predicate: URIRef) -> str:
    return literal_text(tbox, predicate, RDFS.label) or RELATIONS.get(curie(predicate), "관계")
