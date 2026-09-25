// MapLibre 카메라를 공유하는 Three 인스턴스로 사람·차량·열차를 그린다.
import {
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibre,
  MercatorCoordinate,
} from "maplibre-gl";
import {
  BoxGeometry,
  Camera,
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Scene,
  WebGLRenderer,
} from "three";
import {
  type CityActor,
  cityActorPlan,
  type FestivalFocus,
  type Quality,
} from "./city-actors";
import {
  peopleCap,
  sampleRoute,
  type TrafficRoute,
  vehicleCap,
} from "./traffic-routes";

const VEHICLE_KINDS = ["car", "taxi", "bus", "train"] as const;

// 기존 차량 배분 API도 실제 타일 기반의 새 배치와 같은 상한을 쓴다.
export function vehiclePlan(routes: TrafficRoute[], quality: Quality) {
  return cityActorPlan(routes, quality, null).filter(
    (actor) => actor.kind !== "person",
  );
}

// 움직임 감소를 켜면 시간축을 고정해 지도 재그리기에도 배우 위치가 같다.
export function actorSeconds(
  now: number,
  started: number,
  reducedMotion: boolean,
) {
  return reducedMotion ? 0 : (now - started) / 1000;
}

// 지도 이동과 테마 교체 동안 한 WebGL 레이어의 GPU 자원을 관리한다.
export class TrafficLayer implements CustomLayerInterface {
  id = "map-traffic";
  type = "custom" as const;
  renderingMode = "3d" as const;
  private map: MapLibre | null = null;
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera = new Camera();
  private box = new BoxGeometry(1, 1, 1);
  private head = new IcosahedronGeometry(0.5, 0);
  private dummy = new Object3D();
  private position = { x: 0, y: 0, heading: 0 };
  private counts = { person: 0, car: 0, taxi: 0, bus: 0, train: 0 };
  private originX = 0;
  private originY = 0;
  private translation = new Matrix4();
  private meshes: Record<CityActor["kind"] | "head", InstancedMesh> | null =
    null;
  private actors: CityActor[] = [];
  private routes: TrafficRoute[] = [];
  private routeSignature = "";
  private festival: FestivalFocus | null = null;
  private focusX = 0;
  private focusY = 0;
  private reducedMotion = false;
  private visible = true;
  private started = performance.now();

  // 품질 단계는 사람 2500·차량 600을 넘지 않도록 고정한다.
  constructor(private quality: Quality) {}

  // 옷과 머리, 차종은 토큰 팔레트로 칠하고 각 종류를 하나의 드로콜로 묶는다.
  onAdd(map: MapLibre, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: false,
    });
    this.renderer.autoClear = false;
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const make = (
      geometry: BoxGeometry | IcosahedronGeometry,
      token: string,
      cap: number,
    ) => {
      const mesh = new InstancedMesh(
        geometry,
        new MeshBasicMaterial({ color: color(token) }),
        cap,
      );
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.scene.add(mesh);
      return mesh;
    };
    this.meshes = {
      person: make(this.box, "--map-person-base", peopleCap(this.quality)),
      head: make(this.head, "--map-person-skin", peopleCap(this.quality)),
      car: make(this.box, "--map-car", vehicleCap(this.quality)),
      taxi: make(this.box, "--map-taxi", vehicleCap(this.quality)),
      bus: make(this.box, "--map-bus", vehicleCap(this.quality)),
      train: make(this.box, "--map-train", vehicleCap(this.quality)),
    };
    const shirts = Array.from(
      { length: 8 },
      (_, index) => new Color(color(`--map-person-${index + 1}`)),
    );
    for (let index = 0; index < peopleCap(this.quality); index++)
      this.meshes.person.setColorAt(index, shirts[index % shirts.length]);
    if (this.meshes.person.instanceColor)
      this.meshes.person.instanceColor.needsUpdate = true;
  }

  // 타일 목록이 바뀔 때에만 배우를 다시 골라 GPU 할당을 피한다.
  setRoutes(routes: TrafficRoute[]) {
    const signature = routes
      .map(
        (route) =>
          `${route.kind}:${route.points[0]?.join(",")}:${route.points.at(-1)?.join(",")}`,
      )
      .join("|");
    if (signature === this.routeSignature) return;
    this.routeSignature = signature;
    this.routes = routes;
    this.replan();
  }

  // 선택 행사에 맞춰 근처 보행 경로의 비중을 다시 계산한다.
  setFestival(festival: FestivalFocus | null) {
    if (
      festival?.lng === this.festival?.lng &&
      festival?.lat === this.festival?.lat &&
      festival?.peakP50 === this.festival?.peakP50 &&
      festival?.selected === this.festival?.selected
    )
      return;
    this.festival = festival;
    if (festival) {
      const center = MercatorCoordinate.fromLngLat([
        festival.lng,
        festival.lat,
      ]);
      this.focusX = center.x;
      this.focusY = center.y;
    }
    this.replan();
  }

  // 렌더 원점은 첫 도로의 Mercator 좌표로 옮겨 부동소수점 오차를 줄인다.
  private replan() {
    this.actors = cityActorPlan(this.routes, this.quality, this.festival);
    this.originX = this.routes[0]?.points[0]?.[0] ?? 0;
    this.originY = this.routes[0]?.points[0]?.[1] ?? 0;
    this.translation.makeTranslation(this.originX, this.originY, 0);
    document.documentElement.dataset.mapVehicles = String(
      this.actors.filter((actor) => actor.kind !== "person").length,
    );
    document.documentElement.dataset.mapPeople = String(
      this.actors.filter((actor) => actor.kind === "person").length,
    );
    document.documentElement.dataset.mapGathering = String(
      this.actors.filter((actor) => actor.gathering).length,
    );
    document.documentElement.dataset.mapTrains = String(
      this.actors.filter((actor) => actor.kind === "train").length,
    );
    this.map?.triggerRepaint();
  }

  // 움직임 감소 설정은 모든 배우의 시각을 고정한다.
  setMotion(reducedMotion: boolean, visible: boolean) {
    this.reducedMotion = reducedMotion;
    this.visible = visible;
    this.map?.triggerRepaint();
  }

  // 변환 객체와 샘플 버퍼를 재사용해 매 프레임 새 객체를 만들지 않는다.
  render(
    _gl: WebGL2RenderingContext,
    { defaultProjectionData }: CustomRenderMethodInput,
  ) {
    if (
      !this.renderer ||
      !this.meshes ||
      !this.map ||
      !this.actors.length ||
      this.map.getZoom() < 14 ||
      !this.visible
    )
      return;
    this.counts.person = 0;
    for (const kind of VEHICLE_KINDS) this.counts[kind] = 0;
    const seconds = actorSeconds(
      performance.now(),
      this.started,
      this.reducedMotion,
    );
    for (let index = 0; index < this.actors.length; index++) {
      const actor = this.actors[index];
      const route = actor.route;
      if (!route) continue;
      sampleRoute(
        route,
        actor.phase + seconds * actor.speed * route.meterScale,
        this.position,
      );
      if (actor.gathering && index % 3 === 0 && this.festival) {
        const angle = index * 2.3999632297 + seconds * 0.08;
        const radius = route.meterScale * (20 + (index % 5) * 6);
        this.position.x = this.focusX + Math.cos(angle) * radius;
        this.position.y = this.focusY + Math.sin(angle) * radius;
        this.position.heading = angle + Math.PI / 2;
      }
      const person = actor.kind === "person";
      const side = person
        ? (this.counts.person % 2 ? -1 : 1) *
          route.meterScale *
          (route.kind === "walk" ? 2 : 5)
        : 0;
      this.dummy.position.set(
        this.position.x - this.originX + Math.sin(this.position.heading) * side,
        this.position.y - this.originY - Math.cos(this.position.heading) * side,
        route.meterScale * (person ? 1.05 : 1.8),
      );
      this.dummy.rotation.set(0, 0, this.position.heading);
      this.dummy.scale.set(
        route.meterScale *
          (person
            ? 0.75
            : actor.kind === "train"
              ? 17
              : actor.kind === "bus"
                ? 11
                : 4.5),
        route.meterScale * (person ? 0.75 : actor.kind === "train" ? 3 : 2),
        route.meterScale * (person ? 1.8 : actor.kind === "train" ? 3.2 : 2.5),
      );
      this.dummy.updateMatrix();
      this.meshes[actor.kind].setMatrixAt(
        this.counts[actor.kind]++,
        this.dummy.matrix,
      );
      if (person) {
        this.dummy.position.z = route.meterScale * 2.35;
        this.dummy.scale.setScalar(route.meterScale * 0.8);
        this.dummy.updateMatrix();
        this.meshes.head.setMatrixAt(this.counts.person - 1, this.dummy.matrix);
      }
    }
    for (const kind of VEHICLE_KINDS) {
      this.meshes[kind].count = this.counts[kind];
      this.meshes[kind].instanceMatrix.needsUpdate = true;
    }
    this.meshes.person.count = this.meshes.head.count = this.counts.person;
    this.meshes.person.instanceMatrix.needsUpdate = true;
    this.meshes.head.instanceMatrix.needsUpdate = true;
    this.camera.projectionMatrix
      .fromArray(defaultProjectionData.mainMatrix)
      .multiply(this.translation);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    if (!this.reducedMotion) this.map.triggerRepaint();
  }

  // 지도 컨텍스트는 MapLibre에 남기고 이 레이어가 만든 자원만 정리한다.
  onRemove() {
    for (const mesh of Object.values(this.meshes ?? {}))
      mesh.material instanceof MeshBasicMaterial && mesh.material.dispose();
    this.box.dispose();
    this.head.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
    delete document.documentElement.dataset.mapVehicles;
    delete document.documentElement.dataset.mapPeople;
    delete document.documentElement.dataset.mapGathering;
    delete document.documentElement.dataset.mapTrains;
  }
}
