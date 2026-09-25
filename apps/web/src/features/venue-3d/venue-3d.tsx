// 예보서와 개발 견본의 행사장 디오라마를 로딩·빈 값·오류 상태와 함께 제공한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { useEffect, useMemo, useState } from "react";
import { venueDescription } from "../../components/scene/scene-description";
import {
  readSceneOptions,
  useSceneQuality,
} from "../../components/scene/scene-options";
import { buildingCap } from "../../components/scene/venue/buildings";
import {
  sampleEvent,
  type VenueEvent,
  type VenueKey,
  venueFor,
  venueSites,
} from "../../components/scene/venue/sites";
import {
  loadVenueTiles,
  type VenueTiles,
} from "../../components/scene/venue/tiles";
import {
  dollCount,
  venueDate,
  venueSun,
} from "../../components/scene/venue/time";
import { VenueScene } from "../../components/scene/venue/venue-scene";
import { useWeather } from "../../lib/use-weather";
import "./venue-3d.css";

// WebGL2가 없는 환경에서는 조작할 수 없는 캔버스 대신 위치 정보를 보인다.
function canRender(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

// 모션 줄이기 변경을 장면 수명과 함께 구독한다.
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

// 예보 위치와 시범 타일의 교집합을 검사해 열 수 있는 견본 링크를 표시한다.
export function Venue3D({
  report,
  sampleKey,
}: {
  report?: ForecastReport;
  sampleKey?: VenueKey;
}) {
  const event: VenueEvent | null = useMemo(
    () => report?.event ?? (sampleKey ? sampleEvent(sampleKey) : null),
    [report, sampleKey],
  );
  const key = event ? venueFor(event.venue.lng, event.venue.lat) : null;
  const [tiles, setTiles] = useState<VenueTiles | null>(null);
  const qualityOptions = useMemo(readSceneOptions, []);
  const { mode, quality, change } = useSceneQuality(qualityOptions);
  const [error, setError] = useState("");
  const initialHour = event ? Number(event.startsAt.slice(11, 13)) : 12;
  const [hour, setHour] = useState(() => {
    const requested = Number(
      new URLSearchParams(window.location.search).get("venueHour"),
    );
    return Number.isInteger(requested) && requested >= 0 && requested <= 23
      ? requested
      : initialHour;
  });
  const reducedMotion = useReducedMotion();
  const [webgl] = useState(canRender);
  const peak =
    report?.forecast.peakConcurrent.value ??
    report?.forecast.peakConcurrent.p50 ??
    0;
  const profile = report?.forecast.hourlyProfile ?? [];
  const level = report?.forecast.judgment.level ?? 1;
  const sky = event ? venueSun(event, hour).sky : "day";
  const at = event ? venueDate(event.startsAt, hour) : new Date(0);
  const weather = useWeather(
    event?.venue.lat ?? 37.5665,
    event?.venue.lng ?? 126.978,
    at,
    Boolean(event),
  );
  const dolls = dollCount(peak, hour, profile, "high");

  // 행사 좌표가 바뀌면 주변 z15 타일만 새로 읽고 이전 요청 결과는 버린다.
  useEffect(() => {
    if (!key || !event || !webgl) return;
    const controller = new AbortController();
    setTiles(null);
    setError("");
    loadVenueTiles(key, [event.venue.lng, event.venue.lat], controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setTiles(loaded);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : "타일을 읽을 수 없어요.",
          );
      });
    return () => controller.abort();
  }, [key, event, webgl]);

  if (!event || !key)
    return (
      <section className="venue-3d" aria-label="행사장 3D">
        <p>행사장 3D는 시범 행사장 3곳에서만 볼 수 있어요.</p>
        <ul>
          {(Object.keys(venueSites) as VenueKey[]).map((site) => (
            <li key={site}>
              <a href={`/dev/venue/${site}`}>{venueSites[site].name} 견본</a>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <section className="venue-3d" aria-label="행사장 3D">
      <div className="venue-3d__heading">
        <div>
          <h2>{event.venue.name} 주변 3D</h2>
          <p>반경 약 1.2km · © OpenStreetMap · Protomaps</p>
        </div>
        <span>
          {sky === "day" ? "낮" : sky === "dusk" ? "노을" : "밤"} ·{" "}
          {weather?.source === "없음" || !weather
            ? "날씨 정보 없음"
            : weather.pty && weather.pty !== "없음"
              ? weather.pty
              : weather.sky}
        </span>
      </div>
      {!webgl && (
        <p role="status">
          이 브라우저에서는 3D를 볼 수 없어요. 행사장 위치: {event.venue.name}
        </p>
      )}
      {webgl && error && (
        <p role="alert">행사장 타일을 읽지 못했어요. {error}</p>
      )}
      {webgl && !error && !tiles && (
        <p role="status">행사장 건물과 길을 불러오고 있어요.</p>
      )}
      {webgl && tiles && (
        <div className="venue-3d__frame">
          <p className="sr-only" aria-live="polite">
            {venueDescription(
              Math.min(tiles.buildings.length, buildingCap(quality)),
              hour,
              weather,
            )}
          </p>
          <VenueScene
            tiles={tiles}
            event={event}
            siteKey={key}
            peak={peak}
            profile={profile}
            level={level}
            hour={hour}
            reducedMotion={reducedMotion}
            weather={weather}
            qualityMode={mode}
            quality={quality}
            onQualityChange={change}
          />
          <p className="venue-3d__honest">
            건물·도로 = OpenStreetMap · 인형·차량 위치와 흐름은 연출 · 인원
            규모는 예보값 비례 · 날씨 효과 = 기상청 예보 기반 연출
          </p>
        </div>
      )}
      <div className="venue-3d__time">
        <label htmlFor="venue-hour">
          행사일 시간대 <strong>{String(hour).padStart(2, "0")}:00</strong>
        </label>
        <input
          id="venue-hour"
          type="range"
          list="venue-event-hours"
          min="0"
          max="23"
          step="1"
          value={hour}
          onChange={(event) => setHour(Number(event.target.value))}
          aria-valuetext={`${hour}시`}
        />
        {report && (
          <datalist id="venue-event-hours">
            <option value={Number(event.startsAt.slice(11, 13))} label="개최" />
            <option value={Number(event.endsAt.slice(11, 13))} label="종료" />
          </datalist>
        )}
        <p>
          <strong>
            {report
              ? `개최 ${event.startsAt.slice(11, 16)} ~ ${event.endsAt.slice(11, 16)}`
              : "견본은 개최 시간 없음"}
          </strong>{" "}
          · 인형 1개 = {dolls.peoplePerDoll}명 ·{" "}
          {report ? "추정 산식 기반" : "견본 화면 · 예보값 없음"}
        </p>
      </div>
      {tiles && (
        <p className="venue-3d__stations">
          역 표시:{" "}
          {tiles.stations.length
            ? [...new Set(tiles.stations.map((station) => station.name))]
                .slice(0, 8)
                .join(" · ")
            : "주변 타일에 표시된 역 없음"}
        </p>
      )}
      <p className="venue-3d__note">
        참고용 — 담당자 검토 필수. 차량·지하철 위치와 흐름은 실제 교통량이
        아니에요.
      </p>
    </section>
  );
}
