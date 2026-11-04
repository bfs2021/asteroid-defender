# Testing

## Automated tests

- Tests sit next to the code as `*.test.ts`, and benchmarks as `*.bench.ts`.
- There is no DOM test environment. `@react-three/test-renderer` can still mount an R3F scene without a browser (see `src/components/gameScene/AsteroidLayer.test.tsx`); the rest of the suite covers stores, helpers and plugins.
- Test behaviour at the seam that can break. For a bug fix, confirm the new test fails without the fix.

## Why tests aren't enough

`vp check` and `vp test` both stayed green while the released game jammed within seconds (#156), and while `vp dev` crashed on load (#185). If a change affects gameplay, rendering or anything that runs during render, also run it in a browser.

## Checking a change in the browser

The app is served under a base path, so use the URL `vp` prints, which ends in `/asteroid-defender/`.

1. Start `vp dev`, or `vp build` and `vp preview` for production behaviour and any performance claim. Dev tracing distorts timings.
2. Use a fresh profile, so saved onboarding and telemetry settings don't hide problems.
3. Start a run with the real **Start Defense** button.
4. Confirm the canvas renders, with no error screen and no console errors.
5. Watch the HUD for a while. **Destroyed** should climb at a plausible rate, **Active Swarm** should move up and down, and **Base Integrity** should respond to hits.
6. For pool or lifecycle changes, also play through to game over and restart. Confirm the new run starts clean.

Normal play may not stress a change enough. Under dev, you can drive the running game by importing the same modules it uses:

```js
const { usePoolStore } = await import("/asteroid-defender/src/store/poolStore.ts");
usePoolStore.getState().activeAsteroidCount;
```

Report what you ran, for how long and what you saw. Headless Chrome with software rendering is fine for checking behaviour, but its frame rates say nothing about real devices.
