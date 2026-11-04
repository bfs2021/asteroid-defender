import { useState, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { STREAK_FRAG, STREAK_VERT } from "./shaders";

const MAX_STREAKS = 3;
const STREAK_DURATION = 1.8;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

interface StreakSlot {
  active: boolean;
  life: number;
  startPos: THREE.Vector3;
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

function randomizeTrajectory(slot: StreakSlot) {
  const theta = Math.random() * Math.PI * 2;
  const phi = (Math.random() * 0.6 + 0.2) * Math.PI;
  const r = 90;
  slot.startPos.set(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi),
  );
  const tangent = new THREE.Vector3(-Math.sin(theta), Math.cos(theta), 0).normalize();
  const speed = 28 + Math.random() * 22;
  slot.velocity.copy(tangent).multiplyScalar(speed);
  slot.quaternion.setFromUnitVectors(Z_AXIS, tangent);
  slot.life = 0;
  slot.active = true;
}

export default function ShootingStars() {
  const meshRefs = useRef<Array<THREE.Mesh | null>>([]);
  const matRefs = useRef<Array<THREE.ShaderMaterial | null>>([]);
  const slotsRef = useRef<StreakSlot[]>(
    Array.from({ length: MAX_STREAKS }, () => ({
      active: false,
      life: 0,
      startPos: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
    })),
  );

  const timerRef = useRef(0);
  const [firstSpawn] = useState(() => 3 + Math.random() * 5);
  const nextSpawnRef = useRef(firstSpawn);

  const uniformsList = useMemo(
    () => Array.from({ length: MAX_STREAKS }, () => ({ uOpacity: { value: 0 } })),
    [],
  );

  useFrame((_, delta) => {
    timerRef.current += delta;
    if (timerRef.current >= nextSpawnRef.current) {
      timerRef.current = 0;
      nextSpawnRef.current = 6 + Math.random() * 10;

      // Find first inactive slot
      const freeSlotIndex = slotsRef.current.findIndex((s) => !s.active);
      if (freeSlotIndex !== -1) {
        const slot = slotsRef.current[freeSlotIndex];
        randomizeTrajectory(slot);

        const mesh = meshRefs.current[freeSlotIndex];
        if (mesh) {
          mesh.position.copy(slot.startPos);
          mesh.quaternion.copy(slot.quaternion);
          mesh.visible = true;
        }
      }
    }

    // Animate active slots
    const slots = slotsRef.current;
    for (let i = 0; i < MAX_STREAKS; i++) {
      const slot = slots[i];
      if (!slot.active) continue;

      slot.life += delta;
      const t = slot.life / STREAK_DURATION;

      if (t >= 1) {
        slot.active = false;
        const mesh = meshRefs.current[i];
        if (mesh) mesh.visible = false;
        continue;
      }

      const mesh = meshRefs.current[i];
      if (mesh) {
        mesh.position.copy(slot.startPos).addScaledVector(slot.velocity, slot.life);
      }

      const mat = matRefs.current[i];
      if (mat) {
        mat.uniforms.uOpacity.value = Math.sin(t * Math.PI) * 0.9;
      }
    }
  });

  return (
    <>
      {Array.from({ length: MAX_STREAKS }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el;
            if (el) el.visible = false;
          }}
        >
          <boxGeometry args={[0.07, 0.07, 5]} />
          <shaderMaterial
            ref={(el) => {
              matRefs.current[i] = el;
            }}
            uniforms={uniformsList[i]}
            vertexShader={STREAK_VERT}
            fragmentShader={STREAK_FRAG}
            transparent
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}
