import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { act } from "react";
import { Physics } from "@react-three/rapier";
import AsteroidLayer from "./AsteroidLayer";
import { ECS, asteroidQuery } from "../../ecs/world";
import { usePoolStore } from "../../store/poolStore";
import useGameStore from "../../store/gameStore";

// React only batches updates when this flag is set; vite-plus does not set it.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

const POOL_SIZE = 60;
const mounted: Renderer[] = [];

/** One `<object3D>` per asteroid is the host Rapier mounts for its rigid body. */
const poolSlots = (renderer: Renderer) =>
  renderer.scene.findAll((node) => node.type === "Object3D" && node.props.colliders === false);

/** `<group visible={active}>` is how a parked asteroid is hidden (it stays mounted). */
const visibleAsteroids = (renderer: Renderer) =>
  renderer.scene.findAll((node) => node.type === "Group" && node.props.visible === true);

const liveIds = () => asteroidQuery.entities.map((entity) => entity.id).sort();
const activeSlotIds = () =>
  usePoolStore
    .getState()
    .asteroids.filter((slot) => slot.active)
    .map((slot) => slot.id);

async function settle(renderer: Renderer) {
  // Rapier's WASM init is async: wait until every asteroid has its rigid body.
  for (let attempt = 0; attempt < 200 && poolSlots(renderer).length !== POOL_SIZE; attempt++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

async function advance(renderer: Renderer, frames: number) {
  await act(async () => {
    await renderer.advanceFrames(frames, 1 / 60);
  });
}

async function mountLayer() {
  const renderer = await ReactThreeTestRenderer.create(
    <Physics>
      <AsteroidLayer effectsQuality="off" />
    </Physics>,
  );
  await settle(renderer);
  mounted.push(renderer);
  return renderer;
}

const activate = (...spawns: Array<[number, number, number]>) => {
  act(() => {
    usePoolStore
      .getState()
      .activateAsteroids(spawns.map((pos) => ({ pos, type: "swarmer" as const })));
  });
};

beforeEach(() => {
  // Remove entities one by one so Miniplex queries stay in sync: World.clear()
  // empties the world without notifying the query buckets.
  for (const entity of asteroidQuery.entities.slice()) ECS.remove(entity);
  usePoolStore.getState().resetPools(POOL_SIZE);
  useGameStore.setState({ gameState: "playing", asteroidsDestroyed: 0, activeAsteroids: 0 });
});

afterEach(async () => {
  await Promise.all(mounted.splice(0).map((renderer) => renderer.unmount()));
});

describe("AsteroidLayer pool smoke test", () => {
  it("mounts the full pool with no live asteroids", async () => {
    const renderer = await mountLayer();

    expect(poolSlots(renderer)).toHaveLength(POOL_SIZE);
    expect(visibleAsteroids(renderer)).toHaveLength(0);
    expect(asteroidQuery.entities).toHaveLength(0);
    expect(usePoolStore.getState().asteroids).toHaveLength(POOL_SIZE);
  }, 20000);

  it("activation mounts exactly one live asteroid", async () => {
    const renderer = await mountLayer();

    activate([10, 0, 0]);
    await advance(renderer, 2);

    expect(liveIds()).toEqual(activeSlotIds());
    expect(liveIds()).toHaveLength(1);
    expect(visibleAsteroids(renderer)).toHaveLength(1);
    expect(usePoolStore.getState().activeAsteroidCount).toBe(1);
  }, 20000);

  it("destroy removes the entity, frees the slot and fires onDestroy once", async () => {
    const renderer = await mountLayer();

    activate([10, 0, 0]);
    await advance(renderer, 2);
    const entity = asteroidQuery.entities[0];
    const id = entity.id;
    expect(entity.health).toBeGreaterThan(0);

    // Kill it the way a turret does: health drops to zero and the next frame
    // runs the destroy path.
    entity.health = 0;
    await advance(renderer, 1);

    const state = usePoolStore.getState();
    expect(liveIds()).toEqual([]);
    expect(visibleAsteroids(renderer)).toHaveLength(0);
    expect(state.activeAsteroidCount).toBe(0);
    expect(state.asteroidIdToIndex.has(id)).toBe(false);
    expect(state.asteroidFreeList).toHaveLength(POOL_SIZE);
    expect(useGameStore.getState().asteroidsDestroyed).toBe(1);

    // The dead slot must stay dead: onDestroy may not fire again.
    await advance(renderer, 5);
    expect(liveIds()).toEqual([]);
    expect(useGameStore.getState().asteroidsDestroyed).toBe(1);
  }, 20000);

  it("reusing the freed slot produces a live asteroid again", async () => {
    const renderer = await mountLayer();

    activate([10, 0, 0]);
    await advance(renderer, 2);
    const id = asteroidQuery.entities[0].id;
    asteroidQuery.entities[0].health = 0;
    await advance(renderer, 1);
    expect(liveIds()).toEqual([]);

    activate([20, 0, 0]);
    await advance(renderer, 2);

    const state = usePoolStore.getState();
    const reused = state.asteroids.find((slot) => slot.id === id)!;
    expect(reused.active).toBe(true);
    expect(reused.pos).toEqual([20, 0, 0]);
    expect(liveIds()).toEqual([id]);
    expect(visibleAsteroids(renderer)).toHaveLength(1);
    expect(state.activeAsteroidCount).toBe(1);
  }, 20000);

  it("destroy plus spawn in one batch keeps one live asteroid (#156)", async () => {
    const renderer = await mountLayer();

    activate([10, 0, 0]);
    await advance(renderer, 2);
    const dyingId = activeSlotIds()[0];

    activate([12, 0, 0]);
    await advance(renderer, 2);
    const survivorId = activeSlotIds().find((id) => id !== dyingId)!;
    expect(liveIds()).toEqual([dyingId, survivorId].sort());

    const dyingEntity = asteroidQuery.entities.find((entity) => entity.id === dyingId)!;
    dyingEntity.health = 0;
    const slotsBefore = usePoolStore.getState().asteroids;

    // A spawn and a death in the same React batch: the active count ends where
    // it started, so only slot identity can make the layer repaint. This is the
    // #156 jam: the dead slot kept `active` and onDestroy fired every frame.
    await act(async () => {
      usePoolStore.getState().activateAsteroids([{ pos: [30, 0, 0], type: "tank" }]);
      await renderer.advanceFrames(1, 1 / 60);
    });

    const state = usePoolStore.getState();
    const spawnedId = activeSlotIds().find((id) => id !== survivorId)!;
    const dyingIndex = slotsBefore.findIndex((slot) => slot.id === dyingId);
    const spawnedIndex = state.asteroids.findIndex((slot) => slot.id === spawnedId);

    // #156: slots must be replaced, not mutated, or useShallow subscribers miss it.
    expect(state.asteroids[dyingIndex]).not.toBe(slotsBefore[dyingIndex]);
    expect(state.asteroids[spawnedIndex]).not.toBe(slotsBefore[spawnedIndex]);

    expect(liveIds()).toEqual([spawnedId, survivorId].sort());
    expect(visibleAsteroids(renderer)).toHaveLength(2);
    expect(useGameStore.getState().asteroidsDestroyed).toBe(1);

    await advance(renderer, 5);
    expect(liveIds()).toEqual([spawnedId, survivorId].sort());
    expect(useGameStore.getState().asteroidsDestroyed).toBe(1);
  }, 20000);
});
