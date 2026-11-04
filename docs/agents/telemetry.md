# Dev telemetry

Design background is in `docs/ARCHITECTURE/004-development-telemetry.md`.

`vp dev` runs a Babel plugin that wraps first-party functions in `src/` with call tracing. It only applies to the dev server, so production builds aren't instrumented. The runtime is in `src/telemetry/`.

## Controls

| Control                    | Effect                                                        |
| -------------------------- | ------------------------------------------------------------- |
| `Alt+Shift+T`              | Show or hide the overlay, which is on by default              |
| `Alt+Shift+P`              | Pause or resume capture                                       |
| `?telemetry=off`           | Disable for this URL                                          |
| `?telemetry=on`            | Enable for this URL, overriding the saved setting             |
| `window.__DEV_TELEMETRY__` | `getSnapshot()`, `exportJson()`, `clear()`, `mark()` and more |

`__DEV_TELEMETRY__.disable()` and `enable()` save the choice in `localStorage`, so it survives reloads. The overlay's Disable button only lasts until the page reloads.

## Pitfalls

- **Never instrument a function that is read during render.** Each traced call records an event, which invalidates the telemetry snapshot. If the overlay's render calls that function, it re-renders forever and React throws "Maximum update depth exceeded" (#185). Add such modules to `EXCLUDED_PATTERNS` in `tools/telemetry/viteTelemetryPlugin.ts`, as was done for `src/ecs/spawnStats.ts`. The plugin's test only covers `spawnStats`, so check any new function the overlay reads.
- **Tracing distorts timings.** Use it to see what happens and in what order. Use a production build for performance numbers.
- **The buffer fills before play starts.** Load-time work, most likely the nebula texture generation, produces millions of events and overflows the bounded buffer. Call `clear()` when a run starts if you want a usable trace of it.
