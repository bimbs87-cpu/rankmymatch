/**
 * Visual share card for a duel — designed at 1080x1350 (Instagram portrait 4:5).
 * Renders entirely with inline styles so html-to-image can faithfully capture it
 * without depending on Tailwind's runtime layer.
 *
 * Used exclusively inside <DuelShareDialog />.
 */
import { forwardRef } from "react";
import logoNeon from "@/assets/logo-symbol-neon.png";

export interface ShareMedal {
  /** Display label, e.g. "Carrasco" */
  label: string;
  /** Subtitle, e.g. "Mais vitórias diretas" */
  subtitle: string;
  /** "A" | "B" | null — null = no holder, hide */
  holder: "A" | "B" | null;
  /** Holder's display name (already resolved by parent) */
  holderName: string | null;
  /** Number value to show under the holder, e.g. "5" wins */
  value: number;
}

export interface DuelShareCardProps {
  groupName: string;
  seasonName?: string | null;
  playerA: { name: string; rating: number; avatarUrl: string | null };
  playerB: { name: string; rating: number; avatarUrl: string | null };
  winsA: number;
  winsB: number;
  totalMatches: number;
  /** Up to 3 medals shown */
  medals: ShareMedal[];
}

const COLORS = {
  bg: "#0a0a0d",
  bgSoft: "#13131a",
  card: "#16161e",
  border: "rgba(255,255,255,0.08)",
  text: "#e9e9ef",
  muted: "#8b8b97",
  primary: "#b8f24c", // rally neon
  primaryDeep: "#7ec837",
  info: "#5fb4ff",
  destructive: "#ff5a4f",
  warning: "#f5b94c",
};

const Avatar = ({
  name,
  url,
  size,
  ring,
}: {
  name: string;
  url: string | null;
  size: number;
  ring: string;
}) => {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || "")
    .join("");
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: COLORS.bgSoft,
        boxShadow: `0 0 0 6px ${ring}, 0 12px 40px rgba(0,0,0,0.55)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          crossOrigin="anonymous"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span
          style={{
            color: COLORS.text,
            fontFamily: "'Space Grotesk', Inter, system-ui, sans-serif",
            fontWeight: 800,
            fontSize: size * 0.36,
            letterSpacing: "-0.02em",
          }}
        >
          {initials || "?"}
        </span>
      )}
    </div>
  );
};

export const DuelShareCard = forwardRef<HTMLDivElement, DuelShareCardProps>(
  function DuelShareCard(props, ref) {
    const { groupName, seasonName, playerA, playerB, winsA, winsB, totalMatches, medals } = props;
    const winRateA = totalMatches > 0 ? Math.round((winsA / totalMatches) * 100) : 0;
    const winRateB = totalMatches > 0 ? Math.round((winsB / totalMatches) * 100) : 0;
    const leader: "A" | "B" | "tie" = winsA > winsB ? "A" : winsB > winsA ? "B" : "tie";

    return (
      <div
        ref={ref}
        style={{
          width: 1080,
          height: 1350,
          background: `radial-gradient(1200px 800px at 20% 10%, rgba(184,242,76,0.12), transparent 60%), radial-gradient(900px 700px at 90% 90%, rgba(95,180,255,0.08), transparent 60%), ${COLORS.bg}`,
          color: COLORS.text,
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          padding: 60,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src={logoNeon} alt="" crossOrigin="anonymous" style={{ width: 44, height: 44 }} />
            <span
              style={{
                fontFamily: "'Space Grotesk', Inter, system-ui, sans-serif",
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: "-0.01em",
                color: COLORS.text,
              }}
            >
              RankMyMatch
            </span>
          </div>
          <span
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              background: `rgba(184,242,76,0.15)`,
              color: COLORS.primary,
              border: `1px solid rgba(184,242,76,0.30)`,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Duelo
          </span>
        </div>

        {/* Group + season */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontFamily: "'Space Grotesk', Inter, system-ui, sans-serif",
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: COLORS.text,
              lineHeight: 1.1,
            }}
          >
            {groupName}
          </div>
          {seasonName ? (
            <div style={{ marginTop: 6, fontSize: 18, color: COLORS.muted, fontWeight: 500 }}>{seasonName}</div>
          ) : null}
        </div>

        {/* Face-off */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            marginTop: 8,
            marginBottom: 18,
          }}
        >
          {/* Player A */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 0 }}>
            <Avatar name={playerA.name} url={playerA.avatarUrl} size={200} ring={leader === "A" ? COLORS.primary : "rgba(255,255,255,0.10)"} />
            <div
              style={{
                marginTop: 18,
                fontFamily: "'Space Grotesk', Inter, system-ui, sans-serif",
                fontWeight: 800,
                fontSize: 32,
                color: COLORS.text,
                textAlign: "center",
                maxWidth: 280,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {playerA.name}
            </div>
            <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 8 }}>
              <span
                style={{
                  fontFamily: "'Space Grotesk', Inter, system-ui, sans-serif",
                  fontSize: 44,
                  fontWeight: 800,
                  color: leader === "A" ? COLORS.primary : COLORS.text,
                  letterSpacing: "-0.02em",
                }}
              >
                {Math.round(playerA.rating)}
              </span>
              <span style={{ fontSize: 14, color: COLORS.muted, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Elo</span>
            </div>
          </div>

          {/* VS */}
          <div
            style={{
              fontFamily: "'Space Grotesk', Inter, system-ui, sans-serif",
              fontSize: 56,
              fontWeight: 900,
              color: COLORS.muted,
              letterSpacing: "-0.04em",
              padding: "0 8px",
            }}
          >
            VS
          </div>

          {/* Player B */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 0 }}>
            <Avatar name={playerB.name} url={playerB.avatarUrl} size={200} ring={leader === "B" ? COLORS.info : "rgba(255,255,255,0.10)"} />
            <div
              style={{
                marginTop: 18,
                fontFamily: "'Space Grotesk', Inter, system-ui, sans-serif",
                fontWeight: 800,
                fontSize: 32,
                color: COLORS.text,
                textAlign: "center",
                maxWidth: 280,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {playerB.name}
            </div>
            <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 8 }}>
              <span
                style={{
                  fontFamily: "'Space Grotesk', Inter, system-ui, sans-serif",
                  fontSize: 44,
                  fontWeight: 800,
                  color: leader === "B" ? COLORS.info : COLORS.text,
                  letterSpacing: "-0.02em",
                }}
              >
                {Math.round(playerB.rating)}
              </span>
              <span style={{ fontSize: 14, color: COLORS.muted, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Elo</span>
            </div>
          </div>
        </div>

        {/* Big score */}
        <div
          style={{
            marginTop: 8,
            padding: "26px 32px",
            borderRadius: 28,
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, textAlign: "center" }}>
            <div
              style={{
                fontFamily: "'Space Grotesk', Inter, system-ui, sans-serif",
                fontSize: 96,
                fontWeight: 900,
                color: leader === "A" ? COLORS.primary : COLORS.text,
                lineHeight: 1,
                letterSpacing: "-0.04em",
              }}
            >
              {winsA}
            </div>
            <div style={{ marginTop: 8, fontSize: 14, color: COLORS.muted, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {winRateA}% vit.
            </div>
          </div>
          <div style={{ fontSize: 56, color: COLORS.muted, fontWeight: 800, padding: "0 16px" }}>×</div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div
              style={{
                fontFamily: "'Space Grotesk', Inter, system-ui, sans-serif",
                fontSize: 96,
                fontWeight: 900,
                color: leader === "B" ? COLORS.info : COLORS.text,
                lineHeight: 1,
                letterSpacing: "-0.04em",
              }}
            >
              {winsB}
            </div>
            <div style={{ marginTop: 8, fontSize: 14, color: COLORS.muted, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {winRateB}% vit.
            </div>
          </div>
        </div>

        {/* Medals */}
        {medals.length > 0 ? (
          <div
            style={{
              marginTop: 28,
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(medals.length, 3)}, 1fr)`,
              gap: 14,
            }}
          >
            {medals.slice(0, 3).map((m, idx) => {
              const tone = m.holder === "A" ? COLORS.primary : m.holder === "B" ? COLORS.info : COLORS.muted;
              return (
                <div
                  key={idx}
                  style={{
                    padding: "18px 16px",
                    borderRadius: 22,
                    background: COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    {m.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Space Grotesk', Inter, system-ui, sans-serif",
                      fontSize: 22,
                      fontWeight: 800,
                      color: tone,
                      letterSpacing: "-0.01em",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}
                  >
                    {m.holderName ?? "—"}
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 500, lineHeight: 1.3 }}>
                    {m.subtitle}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Footer */}
        <div style={{ marginTop: "auto", paddingTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, color: COLORS.muted, fontWeight: 600 }}>
            {totalMatches} {totalMatches === 1 ? "confronto direto" : "confrontos diretos"}
          </div>
          <div style={{ fontSize: 14, color: COLORS.muted, fontWeight: 600 }}>rankmymatch.app</div>
        </div>
      </div>
    );
  },
);
