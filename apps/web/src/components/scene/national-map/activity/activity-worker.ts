// 도로 연결과 보행 충돌 검사는 작업 스레드에서 계산해 카메라 조작을 막지 않는다.
import type { MapTile } from "../types";
import type { ActivityWindow } from "./window";
import { buildNetwork, type Network } from "./network";
import { visibleActivityData } from "./visible-data";
export type ActivityNetworks = {
  cars: Network;
  people: Network;
  trains: Network;
};
export type ActivityRequest = {
  id: number;
  data?: MapTile;
  window: ActivityWindow;
  people: boolean;
};
const EMPTY: MapTile = { roads: [], areas: [], buildings: [], places: [] };
let data: MapTile = EMPTY;

// 원본 타일은 한 번만 전달받고 이후 카메라 요청에는 작은 화면 좌표만 받는다.
globalThis.onmessage = (event: MessageEvent<ActivityRequest>) => {
  const request = event.data;
  if (request.data) data = request.data;
  const visible =
    request.window.width <= 90
      ? visibleActivityData(data, request.window)
      : EMPTY;
  const networks: ActivityNetworks = {
    cars: buildNetwork(visible, "car"),
    people: buildNetwork(request.people ? visible : EMPTY, "walk"),
    trains: buildNetwork(visible, "rail"),
  };
  globalThis.postMessage({ id: request.id, networks });
};
