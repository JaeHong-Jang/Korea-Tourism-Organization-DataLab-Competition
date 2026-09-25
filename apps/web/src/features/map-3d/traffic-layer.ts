// MapLibre 카메라를 공유하는 Three 인스턴스 차량을 도로·철도 선 위에 그린다.
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibre,
} from "maplibre-gl";
import {
  BoxGeometry,
  Camera,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Scene,
  WebGLRenderer,
} from "three";
import { sampleRoute, type TrafficRoute, vehicleCap } from "./traffic-routes";

type Quality = "high" | "medium" | "low";
type Vehicle = {
  route: TrafficRoute;
  speed: number;
  phase: number;
  kind: "car" | "bus" | "train";
};
const VEHICLE_KINDS = ["car", "bus", "train"] as const;

// 품질 상한 안에서 주요 도로 차량과 철도 열차를 결정적으로 배분한다.
export function vehiclePlan(
  routes: TrafficRoute[],
  quality: Quality,
): Vehicle[] {
  const cap = vehicleCap(quality);
  const roads = routes.filter((route) => route.kind === "road");
  const rails = routes.filter((route) => route.kind === "rail");
  const plan: Vehicle[] = [];
  if (!roads.length && !rails.length) return plan;
  for (let index = 0; index < cap; index++) {
    const railway =
      rails.length > 0 && (roads.length === 0 || index % 12 === 0);
    const choices = railway ? rails : roads.length ? roads : rails;
    const route = choices[index % choices.length];
    plan.push({
      route,
      speed: railway ? 18 : index % 7 === 0 ? 9 : 13,
      phase: ((index * 0.61803398875) % 1) * route.length,
      kind: railway ? "train" : index % 7 === 0 ? "bus" : "car",
    });
  }
  return plan;
}

// 기본 지도는 화면이 잠들거나 낮은 품질이면 프레임 요청 자체를 멈춘다.
export class TrafficLayer implements CustomLayerInterface {
  id = "map-traffic";
  type = "custom" as const;
  renderingMode = "3d" as const;
  private map: MapLibre | null = null;
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera = new Camera();
  private geometry = new BoxGeometry(1, 1, 1);
  private dummy = new Object3D();
  private position = { x: 0, y: 0, heading: 0 };
  private counts = { car: 0, bus: 0, train: 0 };
  private originX = 0;
  private originY = 0;
  private translation = new Matrix4();
  private meshes: Record<Vehicle["kind"], InstancedMesh> | null = null;
  private plan: Vehicle[] = [];
  private routeSignature = "";
  private quality: Quality;
  private reducedMotion = false;
  private visible = true;
  private started = performance.now();

  // 사용자 기기 품질과 화면 숨김을 차량 상한에 반영한다.
  constructor(quality: Quality) {
    this.quality = quality;
  }

  // 차량 세 종류를 각각 하나의 GPU 인스턴스 묶음으로 만든다.
  onAdd(map: MapLibre, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: false,
    });
    this.renderer.autoClear = false;
    const token = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const make = (name: string) =>
      new InstancedMesh(
        this.geometry,
        new MeshBasicMaterial({ color: token(name) }),
        vehicleCap(this.quality),
      );
    this.meshes = {
      car: make("--map-car"),
      bus: make("--map-bus"),
      train: make("--map-train"),
    };
    for (const mesh of Object.values(this.meshes)) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
  }

  // 보이는 타일의 경로가 바뀌면 차량 배치를 새로 고정한다.
  setRoutes(routes: TrafficRoute[]) {
    const signature = routes
      .map(
        (route) =>
          `${route.kind}:${route.points[0]?.join(",")}:${route.points.at(-1)?.join(",")}`,
      )
      .join("|");
    if (signature === this.routeSignature) return;
    this.routeSignature = signature;
    this.plan = vehiclePlan(routes, this.quality);
    this.originX = routes[0]?.points[0]?.[0] ?? 0;
    this.originY = routes[0]?.points[0]?.[1] ?? 0;
    this.translation.makeTranslation(this.originX, this.originY, 0);
    document.documentElement.dataset.mapVehicles = String(this.plan.length);
    this.map?.triggerRepaint();
  }

  // 접근성 설정은 정지 시각을 고정해 위치 흔들림을 없앤다.
  setMotion(reducedMotion: boolean, visible: boolean) {
    this.reducedMotion = reducedMotion;
    this.visible = visible;
    this.map?.triggerRepaint();
  }

  // MapLibre의 Mercator 투영을 그대로 써서 차량이 도로 밖으로 떠 보이지 않게 한다.
  render(
    _gl: WebGL2RenderingContext,
    { defaultProjectionData }: CustomRenderMethodInput,
  ) {
    if (
      !this.renderer ||
      !this.meshes ||
      !this.map ||
      !this.plan.length ||
      this.map.getZoom() < 13 ||
      !this.visible
    )
      return;
    this.counts.car = 0;
    this.counts.bus = 0;
    this.counts.train = 0;
    const seconds = this.reducedMotion
      ? 0
      : (performance.now() - this.started) / 1000;
    for (let index = 0; index < this.plan.length; index++) {
      const vehicle = this.plan[index];
      const { route, kind } = vehicle;
      sampleRoute(
        route,
        vehicle.phase + seconds * vehicle.speed * route.meterScale,
        this.position,
      );
      this.dummy.position.set(
        this.position.x - this.originX,
        this.position.y - this.originY,
        route.meterScale * 1.8,
      );
      this.dummy.rotation.set(0, 0, this.position.heading);
      this.dummy.scale.set(
        route.meterScale * (kind === "train" ? 17 : kind === "bus" ? 11 : 4.5),
        route.meterScale * (kind === "train" ? 3 : 2),
        route.meterScale * (kind === "train" ? 3.2 : 2.5),
      );
      this.dummy.updateMatrix();
      this.meshes[kind].setMatrixAt(this.counts[kind]++, this.dummy.matrix);
    }
    for (const kind of VEHICLE_KINDS) {
      this.meshes[kind].count = this.counts[kind];
      this.meshes[kind].instanceMatrix.needsUpdate = true;
    }
    this.camera.projectionMatrix
      .fromArray(defaultProjectionData.mainMatrix)
      .multiply(this.translation);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    if (!this.reducedMotion) this.map.triggerRepaint();
  }

  // 테마 교체나 보기 해제 때 공유 WebGL 컨텍스트는 남기고 Three 자원만 정리한다.
  onRemove() {
    for (const mesh of Object.values(this.meshes ?? {}))
      mesh.material instanceof MeshBasicMaterial && mesh.material.dispose();
    this.geometry.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
    delete document.documentElement.dataset.mapVehicles;
  }
}
