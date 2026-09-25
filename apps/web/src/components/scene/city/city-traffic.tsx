// 동네 도로 위 승용차·택시·버스와 철길 위 여러 칸 열차를 차체·유리·지붕·바퀴·등으로 만들어 움직인다(연출).
import { useFrame } from "@react-three/fiber";
import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  type InstancedMesh,
  MeshLambertMaterial,
  Vector3,
} from "three";
import type { MotionPoint, MotionRoute } from "../motion/rail-lines";
import { routePosition } from "../motion/rail-lines";
import { sceneColor } from "../quality";
import { towardShare as towardShareAt, vehicleAt } from "../venue/routes";
import { FAR_DISTANCE } from "./city-people";
import { type Pose, stamp } from "./stamp";

// 멀리서 생략하는 작은 부품(바퀴·전조등·후미등·택시 표시등).
const DETAIL_PARTS = ["wheel", "head", "tail", "sign"];
const ORIGIN = new Vector3();

// 사람(3.6배)보다 조금 작게 키워 장난감 비율을 맞춘다.
export const VEHICLE_SCALE = 3.2;
const TRAIN_SCALE = 1.25;
const TRAIN_CARS = 4;

// 품질별 차 수와 열차 수 상한.
export function trafficCaps(quality: "high" | "medium" | "low") {
  return quality === "high"
    ? { cars: 110, trains: 6 }
    : quality === "medium"
      ? { cars: 70, trains: 4 }
      : { cars: 32, trains: 2 };
}

type Kind = "car" | "taxi" | "bus";
// 12대 중 1대는 버스, 5대 중 1대는 택시(나머지 승용차).
function kindOf(index: number): Kind {
  return index % 12 === 0 ? "bus" : index % 5 === 0 ? "taxi" : "car";
}

// 차종별 치수(m, 길이 방향 = +z): 차체·유리 띠·지붕의 높이와 길이.
const SIZES = {
  car: {
    w: 1.8,
    l: 4.3,
    bodyH: 0.7,
    bodyY: 0.55,
    glassY: 1.17,
    glassH: 0.55,
    glassL: 2.3,
    glassZ: -0.2,
    roofY: 1.49,
    roofL: 2.1,
  },
  taxi: {
    w: 1.8,
    l: 4.5,
    bodyH: 0.7,
    bodyY: 0.55,
    glassY: 1.17,
    glassH: 0.55,
    glassL: 2.3,
    glassZ: -0.2,
    roofY: 1.49,
    roofL: 2.1,
  },
  bus: {
    w: 2.5,
    l: 11,
    bodyH: 2.2,
    bodyY: 1.45,
    glassY: 1.95,
    glassH: 0.9,
    glassL: 10.4,
    glassZ: 0,
    roofY: 2.6,
    roofL: 10.8,
  },
} as const;

export function CityTraffic({
  roadRoutes,
  railRoutes,
  quality,
  hour,
  eventHour,
  reducedMotion,
}: {
  roadRoutes: MotionRoute[];
  railRoutes: MotionRoute[];
  quality: "high" | "medium" | "low";
  hour: number;
  eventHour: number;
  reducedMotion: boolean;
}) {
  const caps = trafficCaps(quality);
  const cars = roadRoutes.length ? caps.cars : 0;
  const trains = railRoutes.length
    ? Math.min(caps.trains, railRoutes.length * 2)
    : 0;
  const carts = trains * TRAIN_CARS;
  const refs = {
    body: useRef<InstancedMesh>(null),
    glass: useRef<InstancedMesh>(null),
    roof: useRef<InstancedMesh>(null),
    wheel: useRef<InstancedMesh>(null),
    head: useRef<InstancedMesh>(null),
    tail: useRef<InstancedMesh>(null),
    sign: useRef<InstancedMesh>(null),
    trainBody: useRef<InstancedMesh>(null),
    trainGlass: useRef<InstancedMesh>(null),
    trainStripe: useRef<InstancedMesh>(null),
    trainRoof: useRef<InstancedMesh>(null),
  };
  const box = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const material = useMemo(
    () => new MeshLambertMaterial({ flatShading: true }),
    [],
  );
  const glassMaterial = useMemo(() => new MeshLambertMaterial(), []);
  const lampMaterial = useMemo(
    () => new MeshLambertMaterial({ emissiveIntensity: 0.9 }),
    [],
  );
  const point = useMemo<MotionPoint>(() => ({ x: 0, z: 0, heading: 0 }), []);
  const pose = useMemo<Pose>(
    () => ({ x: 0, y: 0.35, z: 0, heading: 0, size: VEHICLE_SCALE }),
    [],
  );
  const share = towardShareAt(hour, eventHour);
  const detail = useRef(true);

  // 차체 색(승용차 7색·택시·버스 2색)과 유리·바퀴·등 색은 처음 한 번만 칠한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs는 같은 객체를 가리킨다.
  useLayoutEffect(() => {
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
      refs.body.current?.setColorAt(index, color);
      refs.roof.current?.setColorAt(index, color);
      refs.glass.current?.setColorAt(index, glass);
      refs.sign.current?.setColorAt(index, head);
      for (let wheel = 0; wheel < 4; wheel++)
        refs.wheel.current?.setColorAt(index * 4 + wheel, tire);
      for (let side = 0; side < 2; side++) {
        refs.head.current?.setColorAt(index * 2 + side, head);
        refs.tail.current?.setColorAt(index * 2 + side, tail);
      }
    }
    const trainBody = new Color(sceneColor("train-body"));
    const stripe = new Color(sceneColor("train-stripe"));
    const trainRoof = new Color(sceneColor("train-roof"));
    for (let index = 0; index < carts; index++) {
      refs.trainBody.current?.setColorAt(index, trainBody);
      refs.trainStripe.current?.setColorAt(index, stripe);
      refs.trainRoof.current?.setColorAt(index, trainRoof);
      refs.trainGlass.current?.setColorAt(index, glass);
    }
    for (const ref of Object.values(refs)) {
      const mesh = ref.current;
      if (!mesh) continue;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    lampMaterial.emissive.copy(head);
  }, [cars, carts, lampMaterial]);

  // 차 한 대의 부품을 적는다 — 택시만 지붕 표시등을 보이고 나머지는 크기 0으로 숨긴다.
  const placeCar = (index: number, full: boolean) => {
    const [body, glass, roof, wheel, head, tail, sign] = [
      refs.body,
      refs.glass,
      refs.roof,
      refs.wheel,
      refs.head,
      refs.tail,
      refs.sign,
    ].map((ref) => ref.current?.instanceMatrix.array);
    if (!body || !glass || !roof || !wheel || !head || !tail || !sign) return;
    const kind = kindOf(index);
    const size = SIZES[kind];
    const bus = kind === "bus" ? 1.02 : 0.9;
    stamp(body, index, pose, [0, size.bodyY, 0], [size.w, size.bodyH, size.l]);
    stamp(
      glass,
      index,
      pose,
      [0, size.glassY, size.glassZ],
      [size.w * bus, size.glassH, size.glassL],
    );
    stamp(
      roof,
      index,
      pose,
      [0, size.roofY, size.glassZ],
      [size.w * 0.94, 0.1, size.roofL],
    );
    if (!full) return;
    const wheelZ = size.l * 0.32;
    for (let item = 0; item < 4; item++)
      stamp(
        wheel,
        index * 4 + item,
        pose,
        [
          (item % 2 === 0 ? -1 : 1) * size.w * 0.48,
          0.33,
          (item < 2 ? -1 : 1) * wheelZ,
        ],
        [0.26, 0.66, 0.66],
      );
    for (let side = 0; side < 2; side++) {
      const x = (side === 0 ? -1 : 1) * size.w * 0.32;
      stamp(
        head,
        index * 2 + side,
        pose,
        [x, size.bodyY + 0.1, size.l / 2 + 0.02],
        [0.36, 0.16, 0.05],
      );
      stamp(
        tail,
        index * 2 + side,
        pose,
        [x, size.bodyY + 0.1, -size.l / 2 - 0.02],
        [0.32, 0.14, 0.05],
      );
    }
    const shown = kind === "taxi" ? 1 : 0;
    stamp(
      sign,
      index,
      pose,
      [0, size.roofY + 0.14, size.glassZ],
      [0.5 * shown, 0.2 * shown, 0.28 * shown],
    );
  };

  // 열차 칸은 흰 차체·파란 띠·창 띠·회색 지붕 네 부품이다.
  const placeCart = (index: number) => {
    const [body, stripe, glass, roof] = [
      refs.trainBody,
      refs.trainStripe,
      refs.trainGlass,
      refs.trainRoof,
    ].map((ref) => ref.current?.instanceMatrix.array);
    if (!body || !stripe || !glass || !roof) return;
    stamp(body, index, pose, [0, 1.9, 0], [3, 3.2, 18.4]);
    stamp(stripe, index, pose, [0, 1.15, 0], [3.04, 0.35, 18.2]);
    stamp(glass, index, pose, [0, 2.45, 0], [3.05, 0.9, 16.6]);
    stamp(roof, index, pose, [0, 3.6, 0], [2.7, 0.25, 18]);
  };

  // 차는 오른쪽 차로(길 가운데서 비켜)로 달리고, 열차 칸은 같은 선로에서 칸 간격만큼 뒤따른다.
  const place = (seconds: number, full = detail.current) => {
    pose.size = VEHICLE_SCALE;
    for (let index = 0; index < cars; index++) {
      const route = roadRoutes[index % roadRoutes.length];
      vehicleAt(
        route,
        seconds,
        index,
        !reducedMotion && index / cars < share,
        point,
      );
      const lane = 2.2 + (kindOf(index) === "bus" ? 0.6 : 0);
      pose.x = point.x + Math.cos(point.heading) * lane;
      pose.z = point.z - Math.sin(point.heading) * lane;
      pose.y = 0.35;
      pose.heading = point.heading;
      placeCar(index, full);
    }
    pose.size = TRAIN_SCALE;
    for (let train = 0; train < trains; train++) {
      const route = railRoutes[train % railRoutes.length];
      for (let cart = 0; cart < TRAIN_CARS; cart++) {
        routePosition(
          route,
          seconds,
          9,
          train * 173 - cart * 19.2 * TRAIN_SCALE,
          point,
        );
        pose.x = point.x;
        pose.z = point.z;
        pose.y = 0.4;
        pose.heading = point.heading;
        placeCart(train * TRAIN_CARS + cart);
      }
    }
    for (const [name, ref] of Object.entries(refs))
      if (ref.current && (full || !DETAIL_PARTS.includes(name)))
        ref.current.instanceMatrix.needsUpdate = true;
  };

  // 첫 프레임 전에 배치하고, 움직임 줄이기면 그 자리에 멈춘다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: place는 같은 ref·자세 객체만 쓴다.
  useLayoutEffect(() => {
    place(hour * 3600);
  }, [cars, carts, hour]);
  // 멀리서 볼 때는 바퀴·등·표시등을 빼고 차체·유리·지붕만 그린다(사람과 같은 거리 기준).
  useFrame(({ clock, camera, controls }) => {
    const target = (controls as { target?: Vector3 } | null)?.target;
    const full = camera.position.distanceTo(target ?? ORIGIN) < FAR_DISTANCE;
    const changed = full !== detail.current;
    if (changed) {
      detail.current = full;
      const counts = {
        wheel: cars * 4,
        head: cars * 2,
        tail: cars * 2,
        sign: cars,
      };
      for (const [name, count] of Object.entries(counts)) {
        const target = refs[name as keyof typeof counts].current;
        if (target) target.count = full ? count : 0;
      }
    }
    if (!reducedMotion || changed)
      place(hour * 3600 + (reducedMotion ? 0 : clock.elapsedTime), full);
  });

  // 진단은 첫 차 차체 행렬만 읽어 움직임 줄이기의 정지 상태를 확인한다.
  useEffect(() => {
    window.__crowdcastVenueVehicle = () =>
      Array.from(refs.body.current?.instanceMatrix.array.slice(0, 16) ?? []);
    return () => {
      delete window.__crowdcastVenueVehicle;
    };
  }, [refs.body]);

  // 형상·재료는 화면을 떠날 때 해제한다.
  useEffect(
    () => () => {
      box.dispose();
      material.dispose();
      glassMaterial.dispose();
      lampMaterial.dispose();
    },
    [box, material, glassMaterial, lampMaterial],
  );

  const mesh = (
    ref: RefObject<InstancedMesh | null>,
    count: number,
    surface = material,
  ) =>
    count > 0 && (
      <instancedMesh
        ref={ref}
        args={[box, surface, count]}
        frustumCulled={false}
      />
    );
  return (
    <group key={`${cars}-${carts}`}>
      {mesh(refs.body, cars)}
      {mesh(refs.glass, cars, glassMaterial)}
      {mesh(refs.roof, cars)}
      {mesh(refs.wheel, cars * 4)}
      {mesh(refs.head, cars * 2, lampMaterial)}
      {mesh(refs.tail, cars * 2)}
      {mesh(refs.sign, cars, lampMaterial)}
      {mesh(refs.trainBody, carts)}
      {mesh(refs.trainStripe, carts)}
      {mesh(refs.trainGlass, carts, glassMaterial)}
      {mesh(refs.trainRoof, carts)}
    </group>
  );
}
