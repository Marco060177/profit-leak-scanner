import * as React from "react";
import { useI18n } from "~/components/i18n/I18nProvider";

type Props = {
  language: "it" | "en";
  score: number;
};

export default function CopilotConfidenceBar({
  score,
}: Props) {
  const { messages } = useI18n();
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));

  const color =
    safeScore >= 85
      ? "#22c55e"
      : safeScore >= 65
        ? "#f59e0b"
        : "#ff6b4a";

  return (
    <div
      style={{
        marginTop: 18,
        padding: 14,
        borderRadius: 15,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            color: "rgba(255,255,255,0.46)",
            fontSize: 9,
            fontWeight: 950,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {messages.copilotConfidenceBar.overallConfidence}
        </div>

        <div
          style={{
            color,
            fontSize: 13,
            fontWeight: 950,
          }}
        >
          {safeScore}%
        </div>
      </div>

      <div
        style={{
          marginTop: 10,
          height: 8,
          borderRadius: 999,
          background: "rgba(255,255,255,0.07)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${safeScore}%`,
            height: "100%",
            borderRadius: 999,
            background: color,
            boxShadow: `0 0 16px ${color}66`,
          }}
        />
      </div>
    </div>
  );
}
