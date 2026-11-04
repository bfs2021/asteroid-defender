# Architecture

## Where state lives

| State                                | Owner                           | Notes                                                           |
| ------------------------------------ | ------------------------------- | --------------------------------------------------------------- |
| Run state: score, health, game phase | `src/store/gameStore.ts`        | Low-frequency values for the HUD and game flow                  |
| Asteroid and explosion slots         | `src/store/poolStore.ts`        | Fixed pools of pre-mounted components                           |
| Per-frame combat data                | `src/ecs/world.ts`              | Miniplex entities and spatial index; mutated without re-renders |
| Pending spawns                       | `src/ecs/asteroidSpawnQueue.ts` | Module-level queue, drained with a per-frame budget             |
| Spawn and pool tuning                | `src/config/spawning.ts`        | Keep aligned with the budget in `docs/PERFORMANCE.md`           |

## An asteroid's life

1. `src/components/AsteroidSpawner.tsx` enqueues a spawn.
2. `src/components/gameScene/useAsteroidManager.ts` drains the queue each frame, up to `MAX_ACTIVATIONS_PER_FRAME`, and calls `activateAsteroids`.
3. `src/components/Asteroid.tsx` sees its slot become active and adds an ECS entity.
4. `src/components/Turret.tsx` finds targets through ECS queries and applies damage.
5. When the asteroid dies, `Asteroid` calls `onDestroy`. The handler in `src/components/gameScene/AsteroidLayer.tsx` frees the slot, updates the score or base health and triggers the explosion. A splitter destroyed by a turret also enqueues fragments through the same queue.

`useAsteroidManager` also has a `handleDestroy`, but nothing uses it (#186).

## Rules

**Pools**

- Slots are copy-on-write. Build a new slot object instead of mutating one, because `useShallow` subscribers compare by identity. In-place mutation once jammed the game within seconds (#156), and `src/store/poolStore.test.ts` guards against it.
- Components stay mounted. Inactive asteroids are parked at `y = -1000`, not unmounted.
- `<group key={sessionId}>` in `src/components/GameScene.tsx` remounts the scene on restart. Changing that or the order of `useFrame` callbacks can change when a slot dies and is reused, so retest in the browser.

**Hot paths**

- Inside `useFrame`, read stores with `getState()` rather than subscribing, and avoid per-frame allocations. `useAsteroidManager` shows both patterns.
- Keep Zustand selectors narrow, because a re-render near the scene root is expensive.
- Use `delta` for anything time-based, so behaviour doesn't depend on frame rate.
- Raising `ASTEROID_POOL_SIZE` raises steady-state React and physics cost, even when slots are idle.
- Keep cosmetic and heavy code lazy-loaded, like `PostEffects` and `SpaceBackground`. Budgets are in `docs/PERFORMANCE.md`.

## Which docs to trust

The code wins whenever it disagrees with a doc.

| Docs                                                              | Treat as                                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `docs/agents/`                                                    | Current guidance                                                                    |
| `docs/ARCHITECTURE/`                                              | Design context. Some details are out of date (#166)                                 |
| `docs/PERFORMANCE.md`                                             | Budgets are current. Measurements are dated snapshots                               |
| `PERFORMANCE-REVIEW.md`, `PERFORMANCE-REVIEW-spawn-burstiness.md` | Historical. They can cite deleted files, and their numbers aren't a baseline (#166) |
| `idea.md`, `refactoring_suggestions.md`, `scratch.md`             | Notes and proposals, not descriptions of the code or instructions to follow         |
