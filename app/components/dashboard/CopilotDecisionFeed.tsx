import { useI18n } from "~/components/i18n/I18nProvider";

type FeedItem = {
  when: string;
  title: string;
  detail: string;
  color: string;
};

type Props = {
  language: "it" | "en";
  items: FeedItem[];
};

export default function CopilotDecisionFeed({
  items,
}: Props) {
  const { messages } = useI18n();
  const copy = messages.copilotDecisionFeed;
  return (
    <div className="panel" style={{ margin: 0, padding: 25 }}>
      <div className="panel-eyebrow">
        {copy.eyebrow}
      </div>

      <h2 className="panel-title" style={{ marginTop: 6 }}>
        {copy.title}
      </h2>

      <div
        style={{
          position: "relative",
          marginTop: 19,
          display: "grid",
          gap: 11,
        }}
      >
        {items.length > 0 ? (
          items.map((item, index) => (
            <div
              key={`${item.when}-${item.title}`}
              style={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: "38px minmax(0,1fr)",
                gap: 13,
                padding: 14,
                borderRadius: 16,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {index < items.length - 1 && (
                <div
                  style={{
                    position: "absolute",
                    left: 32,
                    top: 49,
                    bottom: -12,
                    width: 1,
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.03))",
                  }}
                />
              )}

              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  display: "grid",
                  placeItems: "center",
                  color: item.color,
                  background: `${item.color}14`,
                  border: `1px solid ${item.color}35`,
                  fontSize: 11,
                  fontWeight: 950,
                }}
              >
                ●
              </div>

              <div>
                <div
                  style={{
                    color: item.color,
                    fontSize: 9,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  {item.when}
                </div>

                <div
                  style={{
                    marginTop: 5,
                    color: "#f8fafc",
                    fontSize: 13,
                    fontWeight: 900,
                  }}
                >
                  {item.title}
                </div>

                <div
                  style={{
                    marginTop: 5,
                    color: "rgba(255,255,255,0.52)",
                    fontSize: 11,
                    lineHeight: 1.5,
                    fontWeight: 730,
                  }}
                >
                  {item.detail}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div
            style={{
              padding: 18,
              borderRadius: 16,
              color: "#86efac",
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.20)",
              fontWeight: 800,
            }}
          >
            {copy.emptyState}
          </div>
        )}
      </div>
    </div>
  );
}
