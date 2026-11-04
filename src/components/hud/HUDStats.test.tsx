import { describe, expect, it } from "vite-plus/test";
import { healthReadout } from "./healthReadout";

// The readout is a pure mapping, so it is tested directly: the repo's component renderer
// (ReactThreeTestRenderer) mounts THREE elements only and cannot render the HUD's span/div.
describe("HUDStats health readout", () => {
  it("shows the ratio, not the raw health, when maxHealth is not 100", () => {
    expect(healthReadout(100, 200).label).toBe("50%");
    expect(healthReadout(100, 100).label).toBe("100%");
  });

  it("is critical on the ratio, not the raw health", () => {
    expect(healthReadout(40, 200).isCritical).toBe(true); // 20%: below the band, though health > 30
    expect(healthReadout(40, 100).isCritical).toBe(false); // 40%: above the band
    expect(healthReadout(30, 100).isCritical).toBe(true); // exactly 30%: the band is inclusive
  });

  it("guards a non-positive maxHealth", () => {
    expect(healthReadout(100, 0).label).toBe("0%");
    expect(healthReadout(100, 0).isCritical).toBe(true);
  });
});
