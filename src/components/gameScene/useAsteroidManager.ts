import { useState, useCallback, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useFrame } from "@react-three/fiber";
import useGameStore from "../../store/gameStore";
import {
  AsteroidType,
  updateSpatialIndex,
  SPATIAL_INDEX_THRESHOLD,
  asteroidQuery,
} from "../../ecs/world";
import { clearAsteroidSpawns, drainAsteroidSpawns } from "../../ecs/asteroidSpawnQueue";
import { MAX_ACTIVATIONS_PER_FRAME } from "../../config/spawning";
import { markTelemetry } from "../../telemetry/runtime";
import { usePoolStore } from "../../store/poolStore";

export interface AsteroidManagerOptions {
  poolSize: number;
}

// Keep for backwards compatibility — activeCount now derived from store
export interface AsteroidPoolState {
  items: Array<{ id: string; active: boolean; pos: [number, number, number]; type: AsteroidType }>;
  activeCount: number;
}

/**
 * Manages the lifecycle of asteroids in the game scene, including spawning,
 * destruction, and synchronization with the global game store.
 *
 * Pool state lives in poolStore; this hook dispatches operations to the store
 * and syncs active count to gameStore.
 */
export function useAsteroidManager({ poolSize }: AsteroidManagerOptions) {
  // Track active count locally and sync to gameStore
  const [activeCount, setActiveAsteroidsCount] = useState(0);

  const { incrementDestroyed, setActiveAsteroids, sessionId } = useGameStore(
    useShallow((state) => ({
      incrementDestroyed: state.incrementDestroyed,
      setActiveAsteroids: state.setActiveAsteroids,
      sessionId: state.sessionId,
    })),
  );

  // Reset pool when sessionId changes, and clean up on unmount
  useEffect(() => {
    usePoolStore.getState().resetPools(poolSize);
    setActiveAsteroidsCount(0);
    setActiveAsteroids(0);
    markTelemetry("asteroids:reset-pool", {
      poolSize,
      sessionId,
    });
    clearAsteroidSpawns();
    return () => {
      clearAsteroidSpawns();
    };
  }, [sessionId, poolSize, setActiveAsteroids]);

  // Update spatial index and process new spawns every frame
  useFrame(() => {
    if (useGameStore.getState().gameState !== "playing") return;

    // Only rebuild the spatial index when the asteroid count is high enough
    // that queries will actually use it (linear scan is faster below threshold)
    if (asteroidQuery.entities.length >= SPATIAL_INDEX_THRESHOLD) {
      updateSpatialIndex();
    }
    // Budget activations per frame so splitter bursts spread over frames
    // instead of all activating at once. Any remainder stays queued.
    const spawns = drainAsteroidSpawns(MAX_ACTIVATIONS_PER_FRAME);
    if (spawns.length > 0) {
      markTelemetry("asteroids:drain-spawns", {
        count: spawns.length,
      });
      usePoolStore.getState().activateAsteroids(spawns);
    }

    // Active count is now maintained incrementally in the store
    // (see `activeAsteroidCount` on `usePoolStore`). Reading it directly
    // avoids a per-frame `asteroids.filter().length` allocation that
    // scales with the pool size.
    const count = usePoolStore.getState().activeAsteroidCount;
    if (count !== activeCount) {
      setActiveAsteroidsCount(count);
      setActiveAsteroids(count);
    }
  });

  const handleDestroy = useCallback(
    (id: string, _pos: [number, number, number], isBaseHit = false, _type: AsteroidType) => {
      if (!isBaseHit) {
        incrementDestroyed();
      }

      usePoolStore.getState().deactivateAsteroid(id);
    },
    [incrementDestroyed],
  );

  // Expose asteroids from store for rendering
  const asteroids = usePoolStore((state) => state.asteroids);

  return {
    asteroids,
    handleDestroy,
  };
}
