import { memo, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import Asteroid from "../Asteroid";
import { usePoolStore } from "../../store/poolStore";
import type { AsteroidType } from "../../ecs/world";
import { enqueueAsteroidFragment } from "../../ecs/asteroidSpawnQueue";
import useGameStore from "../../store/gameStore";
import { markTelemetry } from "../../telemetry/runtime";
import type { EffectsQuality } from "../../utils/visualQuality";

interface AsteroidLayerProps {
  effectsQuality: EffectsQuality;
  onShieldImpact?: (pos: [number, number, number]) => void;
}

const AsteroidLayer = memo(function AsteroidLayer({
  effectsQuality,
  onShieldImpact,
}: AsteroidLayerProps) {
  const asteroids = usePoolStore(useShallow((s) => s.asteroids));
  const activeAsteroidCount = usePoolStore((s) => s.activeAsteroidCount);

  const handleDestroy = useCallback(
    (
      id: string,
      pos: [number, number, number],
      isHit: boolean,
      type: AsteroidType,
      damage: number,
    ) => {
      markTelemetry("asteroids:destroy", { type, baseHit: isHit });

      const store = usePoolStore.getState();
      store.deactivateAsteroid(id);

      if (!isHit) {
        useGameStore.getState().incrementDestroyed();
      } else {
        useGameStore.getState().takeDamage(damage);
        onShieldImpact?.(pos);
      }

      store.triggerExplosion(pos, type);

      if (type === "splitter" && !isHit) {
        // Route fragments through the spawn queue so they share the
        // same backpressure, telemetry, and starvation reporting as
        // regular spawns.
        enqueueAsteroidFragment(pos);
      }
    },
    [onShieldImpact],
  );

  return (
    <>
      {asteroids.map((ast) => (
        <Asteroid
          key={ast.id}
          id={ast.id}
          startPos={ast.pos}
          type={ast.type}
          active={ast.active}
          effectsQuality={effectsQuality}
          activeAsteroidCount={activeAsteroidCount}
          onDestroy={handleDestroy}
        />
      ))}
    </>
  );
});

export default AsteroidLayer;
