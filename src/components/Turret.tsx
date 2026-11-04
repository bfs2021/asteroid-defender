import { useState, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Edges, Line } from "@react-three/drei";
import * as THREE from "three";
import { GameEntity } from "../ecs/world";
import useGameStore from "../store/gameStore";
import {
  applyIdleTurretRotation,
  calculateTurretDamage,
  findTurretTarget,
  LASER_ORIGIN_Z,
  releaseTarget,
} from "./turret/helpers";

const LASER_COLOR = new THREE.Color(10, 2, 2);
const HOLOGRAM_POINTS_X: [number, number, number][] = [
  [-1.55, 0, 0],
  [1.55, 0, 0],
];
const HOLOGRAM_POINTS_Y: [number, number, number][] = [
  [0, -1.55, 0],
  [0, 1.55, 0],
];

interface TurretProps {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
}

export default function Turret({ id, position, rotation }: TurretProps) {
  const turretGroup = useRef<THREE.Group>(null);
  const [rotationX, rotationY, rotationZ] = rotation;
  const baseRotation = useMemo(
    () => new THREE.Euler(rotationX, rotationY, rotationZ),
    [rotationX, rotationY, rotationZ],
  );
  const [idleOffset] = useState(() => Math.random() * Math.PI * 2);
  const [firstRecalibration] = useState(() => 6 + Math.random() * 5);
  const nextRecalibrationRef = useRef(firstRecalibration);
  const recalibrationStartRef = useRef<number | null>(null);
  const pulseRef = useRef(0);
  const impactRef = useRef<THREE.Mesh>(null);
  const coreMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const beamLightRef = useRef<THREE.PointLight>(null);
  const impactLightRef = useRef<THREE.PointLight>(null);
  const laserMeshRef = useRef<THREE.Mesh>(null);
  const barrelGroupRef = useRef<THREE.Group>(null);
  const hologramRingRef = useRef<THREE.Mesh>(null);
  const hologramRingMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const hologramReticleRef = useRef<THREE.Group>(null);
  const targetEffectsRef = useRef<THREE.Group>(null);

  // Keep vectors around instead of full React states to avoid unneeded renders
  const localTargetRef = useRef(new THREE.Vector3());
  const currentTargetRef = useRef<GameEntity | null>(null);
  const hasTargetRef = useRef(false);

  const setTargetEffectsVisible = (visible: boolean) => {
    if (hasTargetRef.current === visible) return;
    hasTargetRef.current = visible;
    if (targetEffectsRef.current) {
      targetEffectsRef.current.visible = visible;
    }
  };

  useFrame((state, delta) => {
    if (!turretGroup.current) return;

    if (useGameStore.getState().gameState !== "playing") {
      releaseTarget(currentTargetRef.current, id);
      currentTargetRef.current = null;
      setTargetEffectsVisible(false);
      return;
    }

    const turret = turretGroup.current;
    const nearestEntity: GameEntity | null = findTurretTarget(turret, id);
    let actualDist = 0;

    if (nearestEntity) {
      // Un-mark previous target if we switched
      if (currentTargetRef.current && currentTargetRef.current !== nearestEntity) {
        releaseTarget(currentTargetRef.current, id);
      }
      currentTargetRef.current = nearestEntity;

      const targetPosition = nearestEntity.position;
      if (!targetPosition) {
        return;
      }

      turret.lookAt(targetPosition);

      // Optimized: Since we just called lookAt, the target's local position
      // is always (0, 0, actualDist). This avoids expensive matrix world
      // updates and worldToLocal inversions every frame.
      const turretPosition = turret.position;
      const dx = turretPosition.x - targetPosition.x;
      const dy = turretPosition.y - targetPosition.y;
      const dz = turretPosition.z - targetPosition.z;
      const actualDistSq = dx * dx + dy * dy + dz * dz;
      actualDist = Math.sqrt(actualDistSq);
      localTargetRef.current.set(0, 0, actualDist);

      nearestEntity.targetedBy = id;

      setTargetEffectsVisible(true);
      recalibrationStartRef.current = null;
      if (barrelGroupRef.current) barrelGroupRef.current.rotation.set(0, 0, 0);

      nearestEntity.health! -= calculateTurretDamage(actualDistSq, delta);
    } else {
      // Clear our lock if no target
      if (currentTargetRef.current) {
        releaseTarget(currentTargetRef.current, id);
        currentTargetRef.current = null;
      }
      setTargetEffectsVisible(false);

      applyIdleTurretRotation(
        turretGroup.current,
        baseRotation,
        state.clock.elapsedTime,
        idleOffset,
      );

      if (
        state.clock.elapsedTime >= nextRecalibrationRef.current &&
        recalibrationStartRef.current === null
      ) {
        recalibrationStartRef.current = state.clock.elapsedTime;
        nextRecalibrationRef.current = state.clock.elapsedTime + 8 + Math.random() * 6;
      }

      if (recalibrationStartRef.current !== null && barrelGroupRef.current) {
        const progress = Math.min(
          (state.clock.elapsedTime - recalibrationStartRef.current) / 1.2,
          1,
        );
        const raise = Math.sin(progress * Math.PI) * 0.35;
        barrelGroupRef.current.rotation.set(-raise, 0, progress * Math.PI * 7);
        if (progress >= 1) {
          recalibrationStartRef.current = null;
          barrelGroupRef.current.rotation.set(0, 0, 0);
        }
      }
    }

    // Pulse Animation for Laser & Impact
    pulseRef.current += delta * 30;
    const elapsedTime = state.clock.elapsedTime;
    const pulse = Math.sin(pulseRef.current) * 0.5 + 0.5;
    const isTargeting = hasTargetRef.current;

    if (coreMaterialRef.current) {
      coreMaterialRef.current.emissiveIntensity = 1.6 + pulse * 1.8;
    }

    if (hologramRingRef.current) {
      hologramRingRef.current.rotation.z = (elapsedTime * 1.2) % (Math.PI * 2);
      const scale = isTargeting ? 1.05 + pulse * 0.2 : 0.95 + pulse * 0.08;
      hologramRingRef.current.scale.setScalar(scale);
    }
    if (hologramRingMaterialRef.current) {
      hologramRingMaterialRef.current.opacity = isTargeting
        ? 0.45 + pulse * 0.2
        : 0.2 + pulse * 0.08;
    }
    if (hologramReticleRef.current) {
      hologramReticleRef.current.rotation.z = (-elapsedTime * 1.6) % (Math.PI * 2);
    }

    if (!isTargeting) return;

    if (laserMeshRef.current) {
      const length = actualDist - LASER_ORIGIN_Z;
      const thickness = 0.08 + pulse * 0.12;
      laserMeshRef.current.scale.set(thickness, thickness, length);
      laserMeshRef.current.position.set(0, 0, LASER_ORIGIN_Z + length * 0.5);
    }

    if (impactRef.current) {
      // Pulse scale between 0.8 and 1.5
      const scale = 0.8 + (Math.sin(pulseRef.current * 1.5) * 0.5 + 0.5) * 0.7;
      impactRef.current.scale.set(scale, scale, scale);
      impactRef.current.position.copy(localTargetRef.current);
    }
    if (beamLightRef.current) {
      beamLightRef.current.position.set(
        localTargetRef.current.x * 0.5,
        localTargetRef.current.y * 0.5,
        LASER_ORIGIN_Z + (localTargetRef.current.z - LASER_ORIGIN_Z) * 0.5,
      );
      beamLightRef.current.intensity = 4 + pulse * 2.5;
    }
    if (impactLightRef.current) {
      impactLightRef.current.position.copy(localTargetRef.current);
      impactLightRef.current.intensity = 5 + pulse * 3;
    }
  });

  return (
    <group position={position} rotation={rotation} ref={turretGroup}>
      <group ref={barrelGroupRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 1.5]}>
          <cylinderGeometry args={[0.8, 0.8, 3, 12]} />
          <meshStandardMaterial color="#888c8d" flatShading />
          <Edges scale={1} threshold={15} color="black" />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, LASER_ORIGIN_Z]}>
          <coneGeometry args={[0.8, 1, 12]} />
          <meshStandardMaterial
            ref={coreMaterialRef}
            color="#e03131"
            emissive="#ff4040"
            emissiveIntensity={2.2}
            flatShading
          />
          <Edges scale={1} threshold={15} color="black" />
        </mesh>
        <mesh position={[0, 0, 3.9]}>
          <sphereGeometry args={[0.22, 10, 10]} />
          <meshBasicMaterial color={LASER_COLOR} toneMapped={false} />
        </mesh>
      </group>
      <group position={[0, 0, 2.3]} ref={hologramReticleRef}>
        <mesh ref={hologramRingRef} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.3, 1.45, 32]} />
          <meshBasicMaterial
            ref={hologramRingMaterialRef}
            color="#7ec8ff"
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <Line points={HOLOGRAM_POINTS_X} color="#7ec8ff" lineWidth={1} transparent opacity={0.45} />
        <Line points={HOLOGRAM_POINTS_Y} color="#7ec8ff" lineWidth={1} transparent opacity={0.45} />
      </group>

      <group ref={targetEffectsRef} visible={false}>
        <mesh ref={laserMeshRef}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={LASER_COLOR} toneMapped={false} />
        </mesh>
        <mesh ref={impactRef} position={[0, 0, 0]}>
          <sphereGeometry args={[0.6, 8, 8]} />
          <meshBasicMaterial color={LASER_COLOR} toneMapped={false} transparent opacity={0.9} />
        </mesh>
        <pointLight
          ref={beamLightRef}
          position={[0, 0, 0]}
          color="#ff4a4a"
          intensity={5}
          distance={14}
          decay={2}
        />
        <pointLight
          ref={impactLightRef}
          position={[0, 0, 0]}
          color="#ff7a5f"
          intensity={7}
          distance={10}
          decay={2}
        />
      </group>
    </group>
  );
}
