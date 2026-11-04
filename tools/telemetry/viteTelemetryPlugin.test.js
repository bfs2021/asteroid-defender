import { describe, expect, it } from "vite-plus/test";
import { devTelemetryVitePlugin } from "./viteTelemetryPlugin.ts";

const SPAWN_STATS_ID = "/repo/src/ecs/spawnStats.ts";
const OTHER_MODULE_ID = "/repo/src/ecs/world.ts";
const SAMPLE_SOURCE = "export function demo() { return 1; }\n";

describe("viteTelemetryPlugin", () => {
  // Its snapshot reader runs during render, so recording it re-invalidates the
  // telemetry snapshot and loops (#185).
  it("does not instrument the spawn stats module", () => {
    expect(devTelemetryVitePlugin().transform(SAMPLE_SOURCE, SPAWN_STATS_ID)).toBeNull();
  });

  it("still instruments other src modules", () => {
    const result = devTelemetryVitePlugin().transform(SAMPLE_SOURCE, OTHER_MODULE_ID);

    expect(result?.code).toContain("__devTelemetryEnter");
  });
});
