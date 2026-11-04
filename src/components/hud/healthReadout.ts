/** The "Base Integrity" readout: the percentage of maxHealth and whether it is critical.
 * One source of truth for both the number and the bar: with a non-100 maxHealth the raw
 * health and the ratio can disagree, and the raw value is not even a percentage. */
export function healthReadout(health: number, maxHealth: number) {
  const percent = maxHealth > 0 ? (health / maxHealth) * 100 : 0;
  return { percent, label: `${Math.round(percent)}%`, isCritical: percent <= 30 };
}
