// 연출용 역 연결선 위로 세 칸짜리 장난감 KTX를 인스턴싱한다.
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
  type InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Vector3,
} from "three";
import { sceneColor } from "../quality";
import { LAND_SURFACE_Y } from "../scene-height";
import {
  type MotionPoint,
  motionSeconds,
  railLines,
  routePosition,
} from "./rail-lines";

const TRAIN_COUNT = railLines.length * 2;
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
  const mesh = useRef<InstancedMesh>(null);
  const block = useMemo(() => new Object3D(), []);
  const point = useMemo<MotionPoint>(() => ({ x: 0, z: 0, heading: 0 }), []);
  const geometry = useMemo(() => new BoxGeometry(2.6, 1.6, 4.6), []);
  const material = useMemo(
    () => new MeshBasicMaterial({ color: sceneColor("model-banner") }),
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
      let index = 0;
      for (let lineIndex = 0; lineIndex < railLines.length; lineIndex++) {
        const line = railLines[lineIndex];
        for (let train = 0; train < 2; train++) {
          for (let car = 0; car < 3; car++) {
            routePosition(
              line,
              seconds,
              3.5,
              train * line.length - car * 5.1,
              point,
            );
            block.position.set(point.x, LAND_SURFACE_Y + 1.4, point.z);
            block.rotation.set(0, point.heading, 0);
            block.updateMatrix();
            mesh.current.setMatrixAt(index++, block.matrix);
          }
        }
      }
      mesh.current.instanceMatrix.needsUpdate = true;
    },
    [block, point],
  );

  // 첫 프레임 전에도 열차가 보이고 설정 변경 시 고정 위치로 돌아간다.
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
      <instancedMesh
        ref={mesh}
        args={[geometry, material, BLOCK_COUNT]}
        frustumCulled={false}
      />
    </group>
  );
}

declare global {
  interface Window {
    __crowdcastTrainPosition?: () => number[];
  }
}
