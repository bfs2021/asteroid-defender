# What to do next

Reviewed: 2026-11-04 @ `5eafb92` (same commit as tag `v1.0.20`). Covers 38 open issues and 1 open PR.
Working note, not documentation: delete it once the items below are done or filed.

## The short version

**Stop working through the review backlog in order: the game is broken, and no open issue says how badly.**

A few seconds into a run, the game jams permanently. The score climbs by 60 per second, almost nothing
new reaches the field, and the base takes no damage. Separately, `vp dev` crashes on load. All checks are
green (`vp check` 0 errors, 129 tests pass) because nothing runs the game loop. #150-#183 came from a code
review; I found these by running the game.

Suggested order:

1. Fix the jam (#156, widened).
2. Fix the dev crash (new issue).
3. Add CI (#165).
4. Restore the shield impact effect (new issue), then do the cheap cleanups.
5. Re-check game balance, then build waves and audio, which players will actually notice.

## Bugs found by running it

### 1. The game jams within seconds (production build) - highest priority

Production build, started with the real "Start Defense" button, reading only the HUD:

| Time | Destroyed | Active Swarm | Base Integrity |
| ---- | --------- | ------------ | -------------- |
| 15s  | 437       | 1            | 100%           |
| 60s  | 3138      | 1            | 100%           |
| 150s | 8538      | 1            | 100%           |

The dev build (`?telemetry=off`) does the same. There, the probe showed:

- a dead tank still in the ECS at **-26,726 health**
- `destroyed` rising by exactly 1 per frame
- the explosion pool stuck at 60/60 active, with none released

Mechanism:

1. An asteroid dies and another spawns in the same frame, so `activeAsteroidCount` doesn't change.
2. Slots are mutated in place (`poolStore.ts:112-115`, `:199-201`), so `useShallow` in `AsteroidLayer.tsx:15`
   sees no change either, and the layer doesn't re-render.
3. The dead slot keeps its `active` prop, so `Asteroid.tsx:177-181` calls `onDestroy` every frame. Each call
   adds a kill and tries to start another explosion (`AsteroidLayer.tsx:18-45`).
4. New spawns kept activating (15 in 15s) but the count never moved. My reading, not directly observed: the
   LIFO free list hands the zombie's own slot to each new spawn, and the zombie kills it in the same frame.

**#156 understates this.** It describes a dead asteroid lingering "until the count next moves", but the
count may never move again. It also covers only asteroids. **Explosions have the same defect with nothing
masking it:** `ExplosionLayer.tsx:7` subscribes only through `useShallow`, so a triggered explosion gets no
re-render from the store, and its slot is never released.

**The #156 fix works.** I applied copy-on-write to all 6 mutation sites in `poolStore.ts`, on a throwaway
copy (not committed), and ran it for 100s:

|                       | Unpatched                            | Copy-on-write              |
| --------------------- | ------------------------------------ | -------------------------- |
| Destroyed vs. spawned | 4504 kills at 90s, about 1 per frame | 145 kills, 147 activations |
| Stuck dead entities   | yes                                  | none                       |
| Explosions active     | stuck at 60/60                       | rise and fall, peak 5      |
| Existing store tests  | pass                                 | pass (30/30)               |

Do in the same PR:

- Add the identity test #156 proposes, for **both** pools.
- Raise #156's priority and extend its scope to explosions.
- Test one remaining case: a slot that dies and is reused in the same batch with the same type keeps
  `active`, `id` and `type`, so the effect at `Asteroid.tsx:86` won't re-run. I expect this to swallow one
  spawn and then recover. I didn't see it in the 100s run, and I didn't test it directly.

Limits of this evidence: headless Chrome at 60fps, 2 unpatched runs (both jammed within 20s) and 1 patched
run. The bug depends on timing, so the moment it starts will vary. I didn't check the deployed site, only a
local build of the commit that `v1.0.20` points at.

### 2. `vp dev` crashes on load - needs a new issue

With default settings, the page shows "Maximum update depth exceeded" from `DevTelemetryOverlay` and no
canvas. No probe is needed to trigger it. **Workaround: add `?telemetry=off` to the URL** (verified).

Probable cause (the workaround fits it, and the served module is instrumented, but I didn't test a fix):
the telemetry plugin instruments `getSpawnStatsSnapshot` because `viteTelemetryPlugin.js:11-17` only excludes
`src/telemetry/`. `DevTelemetryOverlay.tsx:85-89` reads that function during render, which records an event,
which invalidates the telemetry snapshot read at `:80-84`, which forces another render. The spawn stats reads
arrived in `48ad1e5` (#149).

Likely fix: add `spawnStats` to `EXCLUDED_PATTERNS`. Do this before #160, whose verification steps need a
working dev server.

### 3. The shield impact effect never fires - needs a new issue

Found by tracing the code, not by watching it. `addShieldImpact` (`GameScene.tsx:63`) is only called from
`handleDestroy` in `useAsteroidManager.ts:91-110`, and nothing calls that function. The live path is the
`handleDestroy` in `AsteroidLayer.tsx:18`, which never calls it. The `asteroids:destroy` telemetry event is
in the same dead function, so it never fires either.

**#157 as written would hide this.** It calls deleting that code "no behaviour change". Move the shield call
and the telemetry mark into the live handler first, then delete.

## Quick housekeeping (about 10 minutes)

- **Close PR #145.** `main` already has `fflate` 0.6.11 under `three-stdlib`, so the bump looks redundant.
- **Close #119.** All six children (#112-#117) are closed.
- **Close #4 as a duplicate of #126.** Copy #4's pacing comment across first; it's the most useful part.
- **Repair #125 and #126.** Their code spans are blank (e.g. "Could use / to spatialize"). #126 also says
  the spawn interval is 0.5s-5s, while #168 lists the current values as 1.0-5.0.

## Suggested order

### Now

| Item                                | Why                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| #156 + explosions                   | The game doesn't work without it                                                    |
| Dev crash (new)                     | Blocks local running and several other issues' verification                         |
| #165 CI                             | Cheap. Also turn on required status checks in repo settings, or CI is only advisory |
| Render smoke test from #167, step 2 | Raise its priority: this is the test class that would have caught the jam           |

### Next: small, safe, and mostly independent

| Item                           | Note                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shield impact (new), then #157 | In that order. #157 also removes the `usePoolStore` subscription and local state in `useAsteroidManager`, which re-render `GameScene`, so it's a perf win too |
| #162, then #158                | #158's one-line fix goes in the effect #162 makes the single owner                                                                                            |
| #159, #169, #160               | Mechanical. #159 clears 3 of the 5 lint warnings                                                                                                              |
| #172, #173                     | **#173 only after #156.** If the layer stops subscribing to the raw count before slots are copy-on-write, activations stop rendering altogether               |
| #166                           | Docs truth; easier once the above has landed                                                                                                                  |

### Then: player-facing

1. **Re-check balance first.** Once the jam was fixed, the base stayed at 100% for all 100s and the samples
   never showed more than 3 asteroids active. That's one short run, but nobody can have judged the current
   tuning through the jam, so don't trust it.
2. **#126 waves**, which gives that tuning a structure. #168 and #181 are useful groundwork.
3. **#125 audio**, which has no dependencies and is the biggest cheap feel upgrade. The kill and base-hit
   events exist; a continuous laser needs a loop, not one-shots.

### Later or only on demand

- **#161 + #182:** merge these. Both define `src/game/combat.ts` and `applyTurretDamage`.
- **#170 + #180:** do these together, since both change physics.
- **#163, #164:** real refactors, but no player benefit. Do them when next changing those files.
- **#177, #174, #178:** #178 has no visible effect while `maxHealth` is always 100.
- **#179:** gameplay RNG pass only (see below).

## Corrections to the issues

Worth fixing in the issue text before anyone implements from it.

- **#168:** contradicts itself. It notes `SPAWN_RADIUS` (40) is less than `TURRET_RANGE` (50), then proposes a
  test asserting `SPAWN_RADIUS > TURRET_RANGE`, which would fail. Decide the intended relationship first. Also,
  range is measured from each turret and spawn radius from the origin, so the two numbers don't compare directly.
- **#183 math:** the penalty is not "exactly 20 units". It's `D² < d² + 400`, so the allowance is 10 units at
  d=15 and about 4 at d=45. The real effect is weaker than the issue says.
- **#183 blocker:** the claim that a test is impossible until #161 is wrong. `helpers.test.ts:108-165` already
  calls `findTurretTarget` with a `THREE.Group`. #161 also never proposes that signature change. The test at
  `:136-165` pins the current penalty and will need updating.
- **#183 fix:** "DPS loss" is doubtful. Stacking wastes little beyond overkill, and damage falls with distance,
  so splitting can lower total DPS. Hard reservation also leaves a turret idle with a target in range, which will
  look like a bug. Simpler: set the penalty to `TURRET_RANGE_SQ`, so a free target in range always wins, and
  stacking happens only when nothing else is available. This changes balance, so playtest it.
- **#171:** the proposed size of 12 comes from `MAX_ACTIVATIONS_PER_FRAME`, which limits spawns, not deaths. A full
  pool silently drops explosions (`poolStore.ts:235`). The peak of 5 above came from a low-pressure run, so measure
  under load before picking a number.
- **#171, unverified lead:** each explosion has its own `pointLight` toggled through `visible`, and turrets have
  more. Three.js builds shader variants per light count, so a changing count could cause hitches that pool size
  won't fix. Check with a trace before acting on this.
- **#179:** seeding alone won't give replays. Turret damage and spawn timers integrate render-frame `delta`, and
  `StrictMode` (`main.tsx:89`) double-invokes render-time initialisers in dev, which is exactly where `?seed=` is
  used, so they'd consume extra draws from a shared stream. Seed only the spawn roll and position, keep cosmetics
  on `Math.random()`, and promise "reproducible spawn sequence" rather than "replay". #177 already has a fallback
  that doesn't need this.
- **#170:** `setBodyType` on the handle can be overwritten, because `@react-three/rapier` re-applies the `type` prop
  when it changes. Prefer `setEnabled`, or drive `type` from `active`. From reading the library; not tested.

## Decisions only you can make

- **#176:** is starting at `reduced` deliberate? I'd keep it (option A) and delete the dead ternary.
- **#180:** should asteroids hit each other? I'd say no: it's cheaper and keeps approach lines predictable. It also
  makes the ±2 fragment offset unnecessary. It changes difficulty, so decide after the balance check.
- **#183:** focus fire or spread? This decides the targeting policy, more than the penalty's maths does.
- **Root-level review docs:** `PERFORMANCE-REVIEW*.md`, `idea.md` and `refactoring_suggestions.md` need a call on
  whether to archive them (#166 covers only part of this).
