// MapLibre 6은 워커를 별도 모듈 파일로 부른다 — Vite 의존성 묶음에는 그 파일이 없어 404가 나므로, Vite가 묶은 워커 주소를 알려 준다
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);
