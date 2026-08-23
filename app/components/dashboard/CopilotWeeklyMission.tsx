import * as React from "react";

import { useI18n } from "~/components/i18n/I18nProvider";
import { money as formatStoreMoney } from "~/utils/margin";

type Props = {
  language: "it" | "en";
  currencyCode: string;
  recommendation: string;
  missionActions: number;
  missionMinutes: number;
  recoverableProfit: number;
  navigate: (path: string) => void;
};

export default function CopilotWeeklyMission({
  language,
  currencyCode,
  recommendation,
  missionActions,
  missionMinutes,
  recoverableProfit,
  navigate,
}: Props) {
  const { messages } = useI18n();
  const copy = messages.copilotWeeklyMission;
  const locale = language === "it" ? "it-IT" : "en-US";

  const money = (value: number) =>
    formatStoreMoney(value, currencyCode, locale);

  const tasks = copy.tasks;

  const visibleTasks = tasks.slice(
    0,
    Math.max(1, Math.min(3, missionActions)),
  );

  return (
    <div
      style={{
        borderRadius: 26,
        padding: 25,
        background:
          "radial-gradient(circle at top right, rgba(56,189,248,0.11), transparent 42%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
        border: "1px solid rgba(56,189,248,0.19)",
      }}
    >
      <div
        style={{
          color: "#7dd3fc",
          fontSize: 11,
          fontWeight: 950,
          letterSpacing: "0.13em",
          textTransform: "uppercase",
        }}
      >
        {copy.eyebrow}
      </div>

      <h3
        style={{
          margin: "11px 0 0",
          color: "#f8fafc",
          fontSize: 23,
          lineHeight: 1.25,
          fontWeight: 950,
        }}
      >
        {recommendation}
      </h3>

      <div
        style={{
          marginTop: 19,
          display: "grid",
          gap: 10,
        }}
      >
        {visibleTasks.map((task, index) => (
          <div
            key={task}
            style={{
              display: "grid",
              gridTemplateColumns: "34px minmax(0,1fr)",
              gap: 12,
              alignItems: "center",
              padding: 14,
              borderRadius: 15,
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                display: "grid",
                placeItems: "center",
                color: index === 0 ? "#22c55e" : "#7dd3fc",
                background:
                  index === 0
                    ? "rgba(34,197,94,0.10)"
                    : "rgba(56,189,248,0.10)",
                border:
                  index === 0
                    ? "1px solid rgba(34,197,94,0.22)"
                    : "1px solid rgba(56,189,248,0.22)",
                fontWeight: 950,
              }}
            >
              {index === 0 ? "✓" : "□"}
            </div>

            <div
              style={{
                color: "#f8fafc",
                fontSize: 12,
                fontWeight: 850,
              }}
            >
              {task}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 17,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        <div
          style={{
            padding: 14,
            borderRadius: 14,
            background: "rgba(255,255,255,0.035)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div
            style={{
              color: "rgba(255,255,255,0.40)",
              fontSize: 8,
              fontWeight: 950,
              textTransform: "uppercase",
            }}
          >
            {copy.estimatedTime}
          </div>

          <div
            style={{
              marginTop: 6,
              color: "#7dd3fc",
              fontSize: 21,
              fontWeight: 950,
            }}
          >
            {missionMinutes} min
          </div>
        </div>

        <div
          style={{
            padding: 14,
            borderRadius: 14,
            background: "rgba(255,255,255,0.035)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div
            style={{
              color: "rgba(255,255,255,0.40)",
              fontSize: 8,
              fontWeight: 950,
              textTransform: "uppercase",
            }}
          >
            {copy.potential}
          </div>

          <div
            style={{
              marginTop: 6,
              color: "#22c55e",
              fontSize: 21,
              fontWeight: 950,
            }}
          >
            +{money(recoverableProfit)}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="primary-button"
        style={{ width: "100%", marginTop: 17 }}
        onClick={() => navigate("/app/recommendations")}
      >
        {copy.openMission}
      </button>
    </div>
  );
}
