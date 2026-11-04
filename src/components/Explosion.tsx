import { useRef, useEffect, memo, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { AsteroidType } from "../ecs/world";
import { ASTEROID_CONFIGS } from "./asteroid/config";

const EMISSIVE_COLOR = new THREE.Color(10, 2, 0);
const EXPLOSION_FRAGMENT_IDS = Array.from({ length: 8 }, (_, index) => index);
const PARTICLE_COUNT = EXPLOSION_FRAGMENT_IDS.length;
const PARTICLE_GEOMETRY = new THREE.DodecahedronGeometry(0.5, 0);

interface ParticleProps {
  startPos: [number, number, number];
  color: string;
  registerParticle: (index: number, mesh: THREE.Mesh | null) => void;
  registerMaterial: (index: number, material: THREE.MeshStandardMaterial | null) => void;
  index: number;
}

const Particle = memo(
  ({ startPos, color, registerParticle, registerMaterial, index }: ParticleProps) => (
    <mesh
      ref={(mesh) => registerParticle(index, mesh)}
      position={startPos}
      geometry={PARTICLE_GEOMETRY}
    >
      <meshStandardMaterial
        ref={(material) => registerMaterial(index, material)}
        color={color}
        emissive={EMISSIVE_COLOR}
        toneMapped={false}
        flatShading
        transparent
        opacity={1}
      />
    </mesh>
  ),
);

interface ActiveExplosionEffectProps {
  active: boolean;
  position: [number, number, number];
  color: string;
  explosionId: string;
  onComplete: (id: string) => void;
}

const ActiveExplosionEffect = memo(
  ({ active, position, color, explosionId, onComplete }: ActiveExplosionEffectProps) => {
    const blastLightRef = useRef<THREE.PointLight>(null);
    const particleRefs = useRef<Array<THREE.Mesh | null>>(Array(PARTICLE_COUNT).fill(null));
    const materialRefs = useRef<Array<THREE.MeshStandardMaterial | null>>(
      Array(PARTICLE_COUNT).fill(null),
    );
    const particleLifeRef = useRef(new Float32Array(PARTICLE_COUNT));
    const particleVelocityRef = useRef(
      Array.from({ length: PARTICLE_COUNT }, () => new THREE.Vector3()),
    );
    const lifeRef = useRef(1);
    const completedRef = useRef(false);

    const registerParticle = useCallback((index: number, mesh: THREE.Mesh | null) => {
      particleRefs.current[index] = mesh;
    }, []);
    const registerMaterial = useCallback(
      (index: number, material: THREE.MeshStandardMaterial | null) => {
        materialRefs.current[index] = material;
      },
      [],
    );

    useEffect(() => {
      if (!active) return;

      lifeRef.current = 1.0;
      completedRef.current = false;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particleLifeRef.current[i] = 1.0;
        particleVelocityRef.current[i].set(
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15,
        );

        const particle = particleRefs.current[i];
        if (particle) {
          particle.position.set(...position);
          particle.rotation.set(0, 0, 0);
          particle.scale.setScalar(1);
        }

        const material = materialRefs.current[i];
        if (material) {
          material.opacity = 1.0;
        }
      }

      if (blastLightRef.current) {
        blastLightRef.current.intensity = 7;
        blastLightRef.current.position.set(...position);
      }
    }, [active, position]);

    useFrame((_, delta) => {
      if (!active) return;

      lifeRef.current = Math.max(0, lifeRef.current - delta * 1.6);

      if (blastLightRef.current) {
        blastLightRef.current.intensity = 7 * lifeRef.current;
      }

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const particle = particleRefs.current[i];
        if (!particle || particleLifeRef.current[i] <= 0) {
          continue;
        }

        const nextLife = particleLifeRef.current[i] - delta * 1.5;
        particleLifeRef.current[i] = nextLife;

        if (nextLife <= 0) {
          particle.scale.setScalar(0);
          continue;
        }

        const velocity = particleVelocityRef.current[i];
        particle.position.addScaledVector(velocity, delta);
        particle.rotation.x += velocity.y * delta;
        particle.rotation.y += velocity.x * delta;
        particle.scale.setScalar(nextLife);

        const material = materialRefs.current[i];
        if (material) {
          material.opacity = nextLife;
        }
      }

      if (lifeRef.current <= 0 && !completedRef.current) {
        completedRef.current = true;
        onComplete(explosionId);
      }
    });

    return (
      <group visible={active}>
        <pointLight
          ref={blastLightRef}
          position={position}
          color={color}
          intensity={7}
          distance={18}
          decay={2}
        />
        {EXPLOSION_FRAGMENT_IDS.map((fragmentId) => (
          <Particle
            key={fragmentId}
            index={fragmentId}
            startPos={position}
            color={color}
            registerParticle={registerParticle}
            registerMaterial={registerMaterial}
          />
        ))}
      </group>
    );
  },
);

interface ExplosionProps {
  id: string;
  position: [number, number, number];
  type: AsteroidType;
  active: boolean;
  onComplete: (id: string) => void;
}

function Explosion({ id, position, type, active, onComplete }: ExplosionProps) {
  const color = ASTEROID_CONFIGS[type]?.color ?? "#ff6600";

  return (
    <ActiveExplosionEffect
      active={active}
      position={position}
      color={color}
      explosionId={id}
      onComplete={onComplete}
    />
  );
}

export default memo(Explosion);
