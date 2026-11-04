import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import useGameStore from "../../store/gameStore";
import { healthReadout } from "./healthReadout";

const STATE_BADGE: Record<string, { label: string; bg: string; border: string; color: string }> = {
  menu: {
    label: "MENU",
    bg: "rgba(59,130,246,0.24)",
    border: "rgba(96,165,250,0.65)",
    color: "#bfdbfe",
  },
  playing: {
    label: "PLAYING",
    bg: "rgba(34,197,94,0.2)",
    border: "rgba(74,222,128,0.6)",
    color: "#dcfce7",
  },
  paused: {
    label: "PAUSED",
    bg: "rgba(245,158,11,0.2)",
    border: "rgba(251,191,36,0.65)",
    color: "#fef3c7",
  },
  gameover: {
    label: "GAME OVER",
    bg: "rgba(239,68,68,0.2)",
    border: "rgba(248,113,113,0.6)",
    color: "#fee2e2",
  },
};

/** Top-left HUD panel: title badge, health bar, destroyed/active stats. */
function HUDStats() {
  const { asteroidsDestroyed, activeAsteroids, health, maxHealth, gameState } = useGameStore(
    useShallow((state) => ({
      asteroidsDestroyed: state.asteroidsDestroyed,
      activeAsteroids: state.activeAsteroids,
      health: state.health,
      maxHealth: state.maxHealth,
      gameState: state.gameState,
    })),
  );

  const {
    percent: healthPercent,
    label: healthLabel,
    isCritical,
  } = healthReadout(health, maxHealth);
  const stateBadge = STATE_BADGE[gameState] ?? STATE_BADGE.menu;

  return (
    <div
      style={{
        position: "absolute",
        top: "max(16px, env(safe-area-inset-top, 16px))",
        left: "max(16px, env(safe-area-inset-left, 16px))",
        zIndex: 10,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        gap: "clamp(6px, 1vw, 12px)",
        textShadow: "0 2px 6px rgba(0,0,0,0.9)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: "clamp(1.25rem, 3.5vw, 2rem)", color: "#fff" }}>
          Asteroid Defender
        </h1>
        <span
          key={gameState}
          aria-label={`Game state: ${stateBadge.label}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(3px, 0.6vw, 5px) clamp(7px, 1.2vw, 12px)",
            borderRadius: "999px",
            fontSize: "clamp(0.6rem, 1.2vw, 0.72rem)",
            letterSpacing: "0.08em",
            fontWeight: 800,
            lineHeight: 1,
            textTransform: "uppercase",
            color: stateBadge.color,
            background: stateBadge.bg,
            border: `1px solid ${stateBadge.border}`,
            boxShadow: "0 3px 8px rgba(0,0,0,0.3)",
            animation: "hud-badge-pulse 0.2s ease-out",
          }}
        >
          {stateBadge.label}
        </span>
      </div>

      <div
        style={{
          background: "rgba(0, 0, 0, 0.75)",
          padding: "clamp(10px, 1.5vw, 14px) clamp(12px, 2vw, 18px)",
          borderRadius: "8px",
          border: "1px solid rgba(255, 255, 255, 0.28)",
          backdropFilter: "blur(6px)",
        }}
      >
        <div style={{ fontSize: "clamp(0.85rem, 1.8vw, 1.1rem)", marginBottom: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ color: "#d1d5db" }}>Base Integrity</span>
            <span style={{ color: isCritical ? "#ef4444" : "#4ade80", fontWeight: "bold" }}>
              {healthLabel}
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: "12px",
              background: "rgba(255,255,255,0.1)",
              borderRadius: "6px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${healthPercent}%`,
                height: "100%",
                background: isCritical ? "#ef4444" : "#4ade80",
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>

        <div style={{ fontSize: "clamp(0.85rem, 1.8vw, 1.1rem)", marginBottom: "4px" }}>
          <span style={{ color: "#d1d5db" }}>Destroyed: </span>
          <span style={{ color: "#4ade80", fontWeight: "bold" }}>{asteroidsDestroyed}</span>
        </div>
        <div style={{ fontSize: "clamp(0.85rem, 1.8vw, 1.1rem)" }}>
          <span style={{ color: "#d1d5db" }}>Warning | Active Swarm: </span>
          <span style={{ color: activeAsteroids > 5 ? "#ef4444" : "#facc15", fontWeight: "bold" }}>
            {activeAsteroids}
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(HUDStats);
