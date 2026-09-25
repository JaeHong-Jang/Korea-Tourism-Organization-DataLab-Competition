// 동네 차(승용차 7색·택시·버스 2색)와 열차 칸의 부품 색을 칠한다 — 처음 한 번만.
import { Color, type InstancedMesh } from "three";
import { sceneColor } from "../quality";
import { kindOf } from "./vehicle-kit";

type Parts = Record<
  | "body"
  | "glass"
  | "roof"
  | "wheel"
  | "head"
  | "tail"
  | "sign"
  | "trainBody"
  | "trainGlass"
  | "trainStripe"
  | "trainRoof",
  { current: InstancedMesh | null }
>;

// 차체·지붕은 같은 색, 유리·바퀴·등은 공통 색이고 열차는 흰 차체·파란 띠·회색 지붕이다(전조등 색을 돌려준다).
export function paintTraffic(parts: Parts, cars: number, carts: number) {
  const paint = Array.from(
    { length: 7 },
    (_, i) => new Color(sceneColor(`car-${i + 1}`)),
  );
  const taxi = new Color(sceneColor("taxi"));
  const buses = [
    new Color(sceneColor("bus-blue")),
    new Color(sceneColor("bus-green")),
  ];
  const glass = new Color(sceneColor("glass"));
  const tire = new Color(sceneColor("tire"));
  const head = new Color(sceneColor("headlamp"));
  const tail = new Color(sceneColor("taillamp"));
  for (let index = 0; index < cars; index++) {
    const kind = kindOf(index);
    const color =
      kind === "taxi"
        ? taxi
        : kind === "bus"
          ? buses[index % 2]
          : paint[index % 7];
    parts.body.current?.setColorAt(index, color);
    parts.roof.current?.setColorAt(index, color);
    parts.glass.current?.setColorAt(index, glass);
    parts.sign.current?.setColorAt(index, head);
    for (let wheel = 0; wheel < 4; wheel++)
      parts.wheel.current?.setColorAt(index * 4 + wheel, tire);
    for (let side = 0; side < 2; side++) {
      parts.head.current?.setColorAt(index * 2 + side, head);
      parts.tail.current?.setColorAt(index * 2 + side, tail);
    }
  }
  const trainBody = new Color(sceneColor("train-body"));
  const stripe = new Color(sceneColor("train-stripe"));
  const trainRoof = new Color(sceneColor("train-roof"));
  for (let index = 0; index < carts; index++) {
    parts.trainBody.current?.setColorAt(index, trainBody);
    parts.trainStripe.current?.setColorAt(index, stripe);
    parts.trainRoof.current?.setColorAt(index, trainRoof);
    parts.trainGlass.current?.setColorAt(index, glass);
  }
  return { head };
}
