import { lazy, Suspense, useEffect } from "react";
import CinematicCamera from "./CinematicCamera";
import Platform from "./Platform";
import Turret from "./Turret";
import AsteroidSpawner from "./AsteroidSpawner";
import type { EffectsQuality } from "../utils/visualQuality";
import { useShieldImpacts } from "./gameScene/useShieldImpacts";
import { usePoolStore } from "../store/poolStore";
import { ASTEROID_POOL_SIZE } from "../config/spawning";
import { useAsteroidManager } from "./gameScene/useAsteroidManager";
import AsteroidLayer from "./gameScene/AsteroidLayer";
import ExplosionLayer from "./gameScene/ExplosionLayer";

// Lazy-load the cosmetic background so core gameplay geometry renders first.
const SpaceBackground = lazy(() => import("./SpaceBackground"));

// Pool of pre-mounted Asteroid components. Inactive entries are parked off-screen
// so Rapier does not simulate them. The size lives in `config/spawning` so the
// spawner, pool, and store all agree on the cap; see Asteroid.tsx for a full
// explanation of the chosen per-component rendering strategy.
interface GameSceneProps {
  asteroidEffectsQuality: EffectsQuality;
  backgroundEffectsQuality: EffectsQuality;
  reducedMotion: boolean;
  sessionId: number;
}

const TURRET_CONFIGS = [
  {
    id: "t1",
    position: [5, 1, 0] as [number, number, number],
    rotation: [-Math.PI / 2, 0, 0] as [number, number, number],
  },
  {
    id: "t2",
    position: [-5, 1, 0] as [number, number, number],
    rotation: [-Math.PI / 2, 0, 0] as [number, number, number],
  },
  {
    id: "t3",
    position: [5, -1, 0] as [number, number, number],
    rotation: [Math.PI / 2, 0, 0] as [number, number, number],
  },
  {
    id: "t4",
    position: [-5, -1, 0] as [number, number, number],
    rotation: [Math.PI / 2, 0, 0] as [number, number, number],
  },
];

export default function GameScene({
  asteroidEffectsQuality,
  backgroundEffectsQuality,
  reducedMotion,
  sessionId,
}: GameSceneProps) {
  const { shieldImpacts, addShieldImpact } = useShieldImpacts();

  // useAsteroidManager drives spawn queue draining and active count sync.
  // It does NOT render asteroids — that's AsteroidLayer's job.
  useAsteroidManager({
    poolSize: ASTEROID_POOL_SIZE,
  });

  // Reset pool state when session changes
  useEffect(() => {
    usePoolStore.getState().resetPools(ASTEROID_POOL_SIZE);
  }, [sessionId]);

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 20, 10]} intensity={1.5} castShadow />
      <Suspense fallback={null}>
        <SpaceBackground quality={backgroundEffectsQuality} reducedMotion={reducedMotion} />
      </Suspense>
      <CinematicCamera />

      <group key={sessionId}>
        <AsteroidSpawner />

        <Platform shieldImpacts={shieldImpacts} />

        {TURRET_CONFIGS.map((config) => (
          <Turret key={config.id} {...config} />
        ))}

        <AsteroidLayer effectsQuality={asteroidEffectsQuality} onShieldImpact={addShieldImpact} />
        <ExplosionLayer />
      </group>
    </>
  );
}
