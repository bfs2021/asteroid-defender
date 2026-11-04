# Asteroid Defender

A browser 3D defense game: automated turrets protect a platform from asteroid swarms. Built with React 19, React Three Fiber, Rapier physics, Miniplex ECS and Zustand, on the Vite+ (`vp`) toolchain.

## Commands

| Task           | Command                       |
| -------------- | ----------------------------- |
| Install        | `vp install`                  |
| Dev server     | `vp dev`                      |
| Lint and types | `vp check`                    |
| Format a file  | `vp fmt <file>`               |
| Tests          | `vp test`                     |
| Benchmarks     | `vp test bench`               |
| Production     | `vp build`, then `vp preview` |

Before pushing, run `vp check`, `vp test` and `vp build`. `vp check` also checks Markdown formatting.

## Rules for every change

- **Run the game if you change behaviour.** No automated check runs the game loop, so all of them can pass while the game is broken. See [testing](docs/agents/testing.md).
- **Never mutate a pool slot in place.** Replace it, or subscribers miss the change. See [architecture](docs/agents/architecture.md).
- **Trust the code over the docs.** Some existing docs are out of date. See [which docs to trust](docs/agents/architecture.md#which-docs-to-trust).

## Read when

| Read                                        | When you are                                            |
| ------------------------------------------- | ------------------------------------------------------- |
| [Architecture](docs/agents/architecture.md) | Changing gameplay, state, pools, rendering or hot paths |
| [Testing](docs/agents/testing.md)           | Adding tests or verifying a change in the browser       |
| [Telemetry](docs/agents/telemetry.md)       | Debugging in dev, or changing what runs during render   |
| [Workflow](docs/agents/workflow.md)         | Committing, opening a PR or preparing a release         |
