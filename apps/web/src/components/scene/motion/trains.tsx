// 연출용 역 연결선 위로 세 칸짜리 장난감 열차(흰 차체·파란 띠·창)를 인스턴싱한다.
import { useFrame, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  type InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  MeshLambertMaterial,
  Vector3,
} from "three";
import type { Pose } from "../city/stamp";
import { stampCart } from "../city/vehicle-kit";
import { sceneColor } from "../quality";
import { LAND_SURFACE_Y } from "../scene-height";
import {
  type MotionPoint,
  motionSeconds,
  railLines,
  routePosition,
} from "./rail-lines";

const TRAIN_COUNT = railLines.length * 2;
// 한 칸 길이 약 8m(18.4m 칸의 0.45배)와 칸 사이 간격.
const CART_SIZE = 0.45;
const CART_GAP = 8.6;
const BLOCK_COUNT = TRAIN_COUNT * 3;

// 정지 상태와 실행 중 상태 모두 같은 위치 계산으로 행렬을 채운다.
export function Trains({
  reducedMotion,
  diagnostic,
}: {
  reducedMotion: boolean;
  diagnostic: boolean;
}) {
  const clock = useThree((state) => state.clock);
  // 칸마다 흰 차체·파란 띠·창 띠·회색 지붕(동네 3D와 같은 부품) — 차체 행렬이 진단 기준이다.
  const mesh = useRef<InstancedMesh>(null);
  const stripe = useRef<InstancedMesh>(null);
  const glass = useRef<InstancedMesh>(null);
  const roof = useRef<InstancedMesh>(null);
  const point = useMemo<MotionPoint>(() => ({ x: 0, z: 0, heading: 0 }), []);
  const pose = useMemo<Pose>(
    () => ({ x: 0, y: LAND_SURFACE_Y, z: 0, heading: 0, size: CART_SIZE }),
    [],
  );
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const material = useMemo(
    () => new MeshLambertMaterial({ flatShading: true }),
    [],
  );
  const railMaterial = useMemo(
    () => new LineBasicMaterial({ color: sceneColor("model-metal") }),
    [],
  );
  const railGeometry = useMemo(
    () =>
      railLines.map((line) =>
        new BufferGeometry().setFromPoints(
          line.points.map(([x, z]) => new Vector3(x, LAND_SURFACE_Y + 0.5, z)),
        ),
      ),
    [],
  );
  const rails = useMemo(
    () => railGeometry.map((line) => new Line(line, railMaterial)),
    [railGeometry, railMaterial],
  );

  // 열차 세 칸은 같은 경로에서 일정 거리 차를 두어 앞뒤로 왕복한다.
  const place = useCallback(
    (seconds: number) => {
      if (!mesh.current) return;
      const parts = {
        body: mesh.current.instanceMatrix.array,
        stripe: stripe.current?.instanceMatrix.array,
        glass: glass.current?.instanceMatrix.array,
        roof: roof.current?.instanceMatrix.array,
      };
      let index = 0;
      for (let lineIndex = 0; lineIndex < railLines.length; lineIndex++) {
        const line = railLines[lineIndex];
        for (let train = 0; train < 2; train++) {
          for (let car = 0; car < 3; car++) {
            routePosition(
              line,
              seconds,
              3.5,
              train * line.length - car * CART_GAP,
              point,
            );
            pose.x = point.x;
            pose.z = point.z;
            pose.heading = point.heading;
            stampCart(parts, index++, pose);
          }
        }
      }
      for (const target of [mesh, stripe, glass, roof])
        if (target.current) target.current.instanceMatrix.needsUpdate = true;
    },
    [point, pose],
  );

  // 첫 프레임 전에도 열차가 보이고 설정 변경 시 고정 위치로 돌아간다.
  // 부품 색은 처음 한 번만 칠한다(흰 차체·파란 띠·유리·회색 지붕).
  useLayoutEffect(() => {
    const colors = [
      [mesh, "train-body"],
      [stripe, "train-stripe"],
      [glass, "glass"],
      [roof, "train-roof"],
    ] as const;
    for (const [target, token] of colors) {
      const color = new Color(sceneColor(token));
      for (let index = 0; index < BLOCK_COUNT; index++)
        target.current?.setColorAt(index, color);
      if (target.current?.instanceColor)
        target.current.instanceColor.needsUpdate = true;
    }
  }, []);
  useLayoutEffect(
    () => place(motionSeconds(clock.getElapsedTime(), reducedMotion)),
    [clock, place, reducedMotion],
  );
  useFrame((state) => {
    if (!reducedMotion)
      place(motionSeconds(state.clock.elapsedTime, reducedMotion));
  });

  // 진단 함수는 테스트 요청 때만 행렬을 읽고 평소 프레임에는 관여하지 않는다.
  useEffect(() => {
    if (!diagnostic) return;
    document.documentElement.dataset.sceneTrains = String(BLOCK_COUNT);
    window.__crowdcastTrainPosition = () => {
      const matrix = new Matrix4();
      mesh.current?.getMatrixAt(0, matrix);
      return Array.from(matrix.elements);
    };
    return () => {
      delete document.documentElement.dataset.sceneTrains;
      delete window.__crowdcastTrainPosition;
    };
  }, [diagnostic]);

  // 장면에서 제거할 때 선·열차 버퍼와 재료를 함께 해제한다.
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      railMaterial.dispose();
      railGeometry.forEach((line) => {
        line.dispose();
      });
    },
    [geometry, material, railMaterial, railGeometry],
  );

  return (
    <group>
      {rails.map((line, index) => (
        <primitive key={railLines[index].name} object={line} />
      ))}
      {[mesh, stripe, glass, roof].map((target, part) => (
        <instancedMesh
          // biome-ignore lint/suspicious/noArrayIndexKey: 부품 순서는 고정이다.
          key={part}
          ref={target}
          args={[geometry, material, BLOCK_COUNT]}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

declare global {
  interface Window {
    __crowdcastTrainPosition?: () => number[];
  }
}
