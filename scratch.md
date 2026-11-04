# What to do next

Reviewed: 2026-11-04 @ `5eafb92` (same commit as tag `v1.0.20`), updated after #184, #187, #188 and #191 merged
(`4ffb7c9`).
Working note, not documentation: delete it once the items below are done or filed.

## The short version

**The worst bug is fixed on `main` but not released.** `v1.0.20` still has the jam described below, and the
deploy only runs on `v*` tags.

All checks stayed green (`vp check` 0 errors, every test passing) while the game was jammed, because nothing
runs the game loop. #150-#183 came from a code review; the bugs below came from running the game.

Suggested order:

1. Make the CI `check` job required on `main`. It runs on PRs now, but a red run doesn't block a merge yet.
2. Add the render smoke test (#167, step 2).
3. Check balance now that the game can be lost, then tag a release.
4. Restore the shield impact effect (#186), then do the cheap cleanups.
5. Build waves and audio, which players will actually notice.

## Bugs found by running it

### 1. The game jammed within seconds - fixed in #184, not released

Before the fix, on a production build started with the real "Start Defense" button, the HUD showed:

| Time | Destroyed | Active Swarm | Base Integrity |
| ---- | --------- | ------------ | -------------- |
| 15s  | 437       | 1            | 100%           |
| 60s  | 3138      | 1            | 100%           |
| 150s | 8538      | 1            | 100%           |

Pool slots were mutated in place, so `useShallow` subscribers missed the change. A dead asteroid kept its
`active` prop and called `onDestroy` every frame, and explosion slots were never released. #184 made all six
slot changes copy-on-write, in both pools, with identity tests.

After the fix (production build, 90s): Destroyed reached 126, about 1.4/s, with Active Swarm moving between 0
and 2. Under a heavy injected swarm the base reached game over within 10s, no dead asteroid outlived one frame,
and a restart reset cleanly.

**Still only protected by frame order.** A slot that dies and is reused in the same React batch with the same
type keeps `active`, `id` and `type`, so the effect at `Asteroid.tsx:86` wouldn't re-run. This didn't happen
(0 of 169 reuses in a 121s measurement) because spawns currently run before deaths each frame. I think that
order comes from `<group key={sessionId}>` remounting the children, so a refactor could change it unnoticed.
The render smoke test in #167 should pin it.

Limits of this evidence: headless Chrome with software rendering, few runs, and only local builds, not the
deployed site.

### 2. `vp dev` crashed on load - fixed in #187

The page showed "Maximum update depth exceeded" from `DevTelemetryOverlay` and no canvas. #187 excluded
`spawnStats` from telemetry instrumentation. Its test imports both plugin copies, so #160 will need to update it.

Not filed yet: load-time work, most likely `createNebulaTexture.ts`, records about 14.6M telemetry events and
overflows the buffer before play starts.

### 3. The shield impact effect never fires - #186

Found by tracing the code, not by watching it. Its only caller is a dead function, and #157 would delete that
function as "no behaviour change". Do #186 first.

## Quick housekeeping (about 10 minutes)

- **Close PR #145.** `main` already has `fflate` 0.6.11 under `three-stdlib`, so the bump looks redundant.
- **Close #119.** All six children (#112-#117) are closed.
- **Close #4 as a duplicate of #126.** Copy #4's pacing comment across first; it's the most useful part.
- **Repair #125 and #126.** Their code spans are blank (e.g. "Could use / to spatialize"). #126 also says
  the spawn interval is 0.5s-5s, while #168 lists the current values as 1.0-5.0.

## Suggested order

### Now

| Item                                | Why                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Required `check` on `main`          | CI (#188) is only advisory until this is on                               |
| Render smoke test from #167, step 2 | Raise its priority: this is the test class that would have caught the jam |
| Balance check, then tag a release   | Players still have the jam                                                |

### Next: small, safe, and mostly independent

| Item             | Note                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #186, then #157  | In that order. #157 also removes the `usePoolStore` subscription and local state in `useAsteroidManager`, which re-render `GameScene`, so it's a perf win too |
| #162, then #158  | #158's one-line fix goes in the effect #162 makes the single owner                                                                                            |
| #159, #169, #160 | Mechanical. #159 clears 3 of the 5 lint warnings                                                                                                              |
| #172, #173       | Unblocked by #184: slots are now copy-on-write, so the layer can stop subscribing to the raw count                                                            |
| #166             | Docs truth; easier once the above has landed                                                                                                                  |

### Then: player-facing

1. **Re-check balance first.** Two 90-105s runs after the fix differed: one ended at 100% base, the other at
   90%. That's too little to judge, and nobody can have assessed the tuning through the jam.
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
  pool silently drops explosions (`poolStore.ts:235`). Explosions peaked at 5 under normal play but 11 under a heavy injected swarm,
  so 12 leaves almost no margin. Measure under real load before picking a number.
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
