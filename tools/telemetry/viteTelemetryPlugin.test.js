import { describe, expect, it } from "vite-plus/test";
import { devTelemetryVitePlugin as devTelemetryVitePluginJs } from "./viteTelemetryPlugin.js";
import { devTelemetryVitePlugin as devTelemetryVitePluginTs } from "./viteTelemetryPlugin.ts";

const SPAWN_STATS_ID = "/repo/src/ecs/spawnStats.ts";
const OTHER_MODULE_ID = "/repo/src/ecs/world.ts";
const SAMPLE_SOURCE = "export function demo() { return 1; }\n";

// Both copies must exclude spawnStats: its snapshot reader runs during render, so
// recording it re-invalidates the telemetry snapshot and loops (#185).
describe.each([
  ["viteTelemetryPlugin.js", devTelemetryVitePluginJs],
  ["viteTelemetryPlugin.ts", devTelemetryVitePluginTs],
])("%s", (_name, createPlugin) => {
  it("does not instrument the spawn stats module", () => {
    expect(createPlugin().transform(SAMPLE_SOURCE, SPAWN_STATS_ID)).toBeNull();
  });

  it("still instruments other src modules", () => {
    const result = createPlugin().transform(SAMPLE_SOURCE, OTHER_MODULE_ID);

    expect(result?.code).toContain("__devTelemetryEnter");
  });
});
