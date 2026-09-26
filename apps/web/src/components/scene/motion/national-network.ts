// 전국 판 연출용 교통망 — 주요 도시·역·항구·공항 좌표를 이은 고속도로축·철도·뱃길·하늘길(실제 선형·운행 아님).
import { projectKorea } from "../projection";
import { PLACES, type Place } from "./national-places";
import type { MotionRoute } from "./rail-lines";

// 투영한 점 목록의 누적 거리를 한 번만 만든다.
export function lineRoute(
  name: string,
  points: [number, number][],
): MotionRoute {
  const lengths = [0];
  for (let index = 1; index < points.length; index++)
    lengths.push(
      lengths[index - 1] +
        Math.hypot(
          points[index][0] - points[index - 1][0],
          points[index][1] - points[index - 1][1],
        ),
    );
  return { name, points, lengths, length: lengths.at(-1) ?? 0 };
}
const via = (name: string, places: Place[]) =>
  lineRoute(
    name,
    places.map((place) => projectKorea(PLACES[place][0], PLACES[place][1])),
  );
const lonLat = (name: string, points: [number, number][]) =>
  lineRoute(
    name,
    points.map(([longitude, latitude]) => projectKorea(longitude, latitude)),
  );

// 경로 전체를 진행 방향 왼쪽으로 amount(km)만큼 평행 이동한다(꼭짓점은 앞뒤 선분 법선의 평균).
export function shiftRoute(route: MotionRoute, amount: number): MotionRoute {
  const { points } = route;
  const normal = (a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz) || 1;
    return [-dz / length, dx / length];
  };
  const shifted = points.map((point, index): [number, number] => {
    const before = index > 0 ? normal(points[index - 1], point) : null;
    const after =
      index < points.length - 1 ? normal(point, points[index + 1]) : null;
    const nx =
      ((before?.[0] ?? 0) + (after?.[0] ?? 0)) / (before && after ? 2 : 1);
    const nz =
      ((before?.[1] ?? 0) + (after?.[1] ?? 0)) / (before && after ? 2 : 1);
    return [point[0] + nx * amount, point[1] + nz * amount];
  });
  return lineRoute(route.name, shifted);
}

// 고속도로축(도시를 이은 직선) — 전국 판 차가 다니는 길.
// 같은 구간을 나눠 쓰는 축(예: 경부·동해축의 경주–울산–부산)은 축마다 옆으로 2.5km씩 비켜 나란한 차로가 되게 한다.
export const highways = [
  via("경부축", [
    "서울",
    "수원",
    "천안아산",
    "대전",
    "김천구미",
    "구미",
    "동대구",
    "경주",
    "울산",
    "부산",
  ]),
  via("서해안축", [
    "서울",
    "안산",
    "화성",
    "평택",
    "당진",
    "서산",
    "홍성",
    "보령",
    "서천",
    "군산",
    "고창",
    "영광",
    "목포",
  ]),
  via("호남축", ["대전", "논산", "익산", "전주", "정읍", "광주"]),
  via("남해축", [
    "목포",
    "나주",
    "광주",
    "순천",
    "광양",
    "하동",
    "사천",
    "진주",
    "창원",
    "김해",
    "부산",
  ]),
  via("영동축", [
    "인천",
    "수원",
    "용인",
    "이천",
    "여주",
    "원주",
    "평창",
    "강릉",
  ]),
  via("중부내륙축", [
    "여주",
    "충주",
    "문경",
    "상주",
    "김천구미",
    "고령",
    "창원",
  ]),
  via("중앙축", [
    "춘천",
    "홍천",
    "원주",
    "제천",
    "단양",
    "영주",
    "안동",
    "의성",
    "동대구",
  ]),
  via("동해축", [
    "속초",
    "양양",
    "강릉",
    "동해",
    "삼척",
    "울진",
    "영덕",
    "포항",
    "경주",
    "울산",
    "부산",
  ]),
  via("광주대구축", ["동대구", "고령", "거창", "함양", "남원", "담양", "광주"]),
  via("서울양양축", ["서울", "춘천", "홍천", "양양"]),
  via("당진영덕축", [
    "당진",
    "공주",
    "세종",
    "청주",
    "보은",
    "상주",
    "안동",
    "청송",
    "영덕",
  ]),
  via("통영대전축", ["대전", "함양", "진주", "통영"]),
  via("전라축", ["전주", "남원", "순천", "여수"]),
  via("수도권축", ["인천", "서울", "의정부"]),
  via("수도권 남부축", ["서울", "성남", "용인"]),
  via("제주 일주", ["제주시", "한림", "서귀포", "성산", "제주시"]),
].map((route, index) => shiftRoute(route, ((index % 3) - 1) * 2.5));

// 철도(역을 이은 직선) — 앞의 세 KTX는 기존 전국 판과 같다. 같은 도시를 잇는 고속도로와 겹치지 않게 9km 옆으로 둔다.
export const railways = [
  via("경부 KTX", ["서울", "대전", "동대구", "부산"]),
  via("호남 KTX", ["용산", "광주송정", "목포"]),
  via("강릉 KTX", ["서울", "강릉"]),
  via("전라선", ["익산", "전주", "남원", "순천", "여수"]),
  via("경전선", ["사상", "창원", "진주", "순천", "광주송정"]),
  via("중앙선", ["청량리", "원주", "제천", "영주", "안동", "경주"]),
  via("동해선", ["포항", "경주", "울산", "해운대"]),
  via("경춘선", ["청량리", "춘천"]),
  via("충북선", ["오송", "청주", "충주", "제천"]),
  via("장항선", ["천안아산", "홍성", "보령", "서천", "군산", "익산"]),
  via("영동선", ["영주", "동해", "강릉"]),
].map((route) => shiftRoute(route, 9));

// 뱃길(바다 위 경유점을 이은 선) — 여객선 항로를 흉내 낸 연출.
export const seaways = [
  lonLat("부산–제주", [
    [129.04, 35.08],
    [129.0, 34.9],
    [128.5, 34.55],
    [127.6, 34.05],
    [126.9, 33.7],
    [126.54, 33.53],
  ]),
  lonLat("목포–제주", [
    [126.37, 34.77],
    [126.28, 34.55],
    [126.25, 34.2],
    [126.45, 33.7],
    [126.52, 33.53],
  ]),
  lonLat("완도–제주", [
    [126.76, 34.3],
    [126.72, 34.0],
    [126.57, 33.54],
  ]),
  lonLat("포항–울릉", [
    [129.4, 36.04],
    [129.7, 36.3],
    [130.4, 37.0],
    [130.9, 37.47],
  ]),
  lonLat("강릉–울릉", [
    [128.96, 37.77],
    [129.6, 37.66],
    [130.86, 37.5],
  ]),
  lonLat("여수–거문도", [
    [127.74, 34.72],
    [127.72, 34.55],
    [127.45, 34.2],
    [127.32, 34.04],
  ]),
  lonLat("인천–덕적도", [
    [126.58, 37.44],
    [126.42, 37.34],
    [126.16, 37.24],
  ]),
  lonLat("인천–백령도", [
    [126.55, 37.43],
    [126.25, 37.33],
    [125.6, 37.55],
    [124.95, 37.88],
    [124.71, 37.96],
  ]),
];

// 하늘길(공항 사이 직선, 국제선은 판 밖 방향으로 나간다) — 비행기 연출.
export const airways = [
  lonLat("김포–제주", [
    [126.79, 37.56],
    [126.49, 33.51],
  ]),
  lonLat("김포–제주 2", [
    [126.8, 37.55],
    [126.5, 33.5],
  ]),
  lonLat("김포–김해", [
    [126.79, 37.56],
    [128.94, 35.18],
  ]),
  lonLat("청주–제주", [
    [127.5, 36.72],
    [126.49, 33.51],
  ]),
  lonLat("김해–제주", [
    [128.94, 35.18],
    [126.49, 33.51],
  ]),
  lonLat("대구–제주", [
    [128.66, 35.89],
    [126.49, 33.51],
  ]),
  lonLat("광주–제주", [
    [126.81, 35.13],
    [126.49, 33.51],
  ]),
  lonLat("무안–제주", [
    [126.38, 34.99],
    [126.5, 33.51],
  ]),
  lonLat("김포–울산", [
    [126.79, 37.56],
    [129.35, 35.59],
  ]),
  lonLat("김포–여수", [
    [126.79, 37.56],
    [127.62, 34.84],
  ]),
  lonLat("양양–제주", [
    [128.67, 38.06],
    [126.49, 33.51],
  ]),
  lonLat("인천–서해 국제선", [
    [126.44, 37.46],
    [124.6, 36.6],
  ]),
  lonLat("인천–남쪽 국제선", [
    [126.44, 37.46],
    [125.2, 34.2],
  ]),
  lonLat("김해–동쪽 국제선", [
    [128.94, 35.18],
    [130.3, 34.6],
  ]),
];
