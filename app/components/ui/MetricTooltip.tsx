import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export type MetricTooltipContent = {
  title: string;
  description: string;
  formula?: string;
  note?: string;
};

type Props = {
  content: MetricTooltipContent;
};

export default function MetricTooltip({
  content,
}: Props) {
  const id = useId();

  const wrapperRef =
    useRef<HTMLSpanElement | null>(null);

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(
      event: PointerEvent,
    ) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(
          event.target as Node,
        )
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener(
      "pointerdown",
      handlePointerDown,
    );

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [open]);

  return (
    <span
      ref={wrapperRef}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`More information about ${content.title}`}
        aria-describedby={
          open ? id : undefined
        }
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();

          setOpen((current) => !current);
        }}
        onFocus={() => setOpen(true)}
        style={{
          width: 17,
          height: 17,
          minWidth: 17,
          padding: 0,
          borderRadius: "50%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",

          border:
            "1px solid rgba(255,115,60,0.38)",

          background:
            "linear-gradient(180deg, rgba(255,115,60,0.13), rgba(255,115,60,0.055))",

          color: "#ff8a5c",

          boxShadow:
            "0 0 12px rgba(255,115,60,0.06), inset 0 0 0 1px rgba(255,255,255,0.025)",

          fontSize: 10,
          fontWeight: 950,
          lineHeight: 1,

          cursor: "help",
          flexShrink: 0,
          outline: "none",
        }}
      >
        i
      </button>

      {open ? (
        <div
          id={id}
          role="tooltip"
          style={{
            position: "absolute",

            left: "50%",
            bottom: "calc(100% + 10px)",

            transform:
              "translateX(-50%)",

            zIndex: 1000,

            width: 300,
            maxWidth:
              "min(300px, calc(100vw - 40px))",

            padding: 14,

            borderRadius: 14,

            border:
              "1px solid rgba(255,115,60,0.22)",

            background:
              "linear-gradient(145deg, rgba(17,21,29,0.99), rgba(7,11,18,0.995))",

            boxShadow:
              "0 18px 45px rgba(0,0,0,0.50), 0 0 22px rgba(255,115,60,0.07)",

            color: "#f8fafc",

            textTransform: "none",
            letterSpacing: "normal",

            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#ff733c",
                boxShadow:
                  "0 0 9px rgba(255,115,60,0.65)",
                flexShrink: 0,
              }}
            />

            <div
              style={{
                color: "#ffffff",
                fontSize: 12,
                lineHeight: 1.3,
                fontWeight: 950,
              }}
            >
              {content.title}
            </div>
          </div>

          <div
            style={{
              marginTop: 8,
              color:
                "rgba(226,232,240,0.76)",
              fontSize: 11,
              lineHeight: 1.5,
              fontWeight: 650,
            }}
          >
            {content.description}
          </div>

          {content.formula ? (
            <div
              style={{
                marginTop: 10,
                padding: "9px 10px",

                borderRadius: 10,

                background:
                  "rgba(255,255,255,0.03)",

                border:
                  "1px solid rgba(255,255,255,0.065)",
              }}
            >
              <div
                style={{
                  color:
                    "rgba(148,163,184,0.72)",
                  fontSize: 8,
                  lineHeight: 1.2,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                How it&apos;s calculated
              </div>

              <div
                style={{
                  marginTop: 4,
                  color:
                    "rgba(241,245,249,0.90)",
                  fontSize: 10,
                  lineHeight: 1.45,
                  fontWeight: 700,
                }}
              >
                {content.formula}
              </div>
            </div>
          ) : null}

          {content.note ? (
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,

                borderTop:
                  "1px solid rgba(255,255,255,0.055)",

                color:
                  "rgba(148,163,184,0.72)",

                fontSize: 9,
                lineHeight: 1.45,
                fontWeight: 650,
              }}
            >
              {content.note}
            </div>
          ) : null}

          <div
            style={{
              position: "absolute",

              left: "50%",
              bottom: -5,

              transform:
                "translateX(-50%) rotate(45deg)",

              width: 9,
              height: 9,

              background:
                "rgba(7,11,18,0.995)",

              borderRight:
                "1px solid rgba(255,115,60,0.18)",

              borderBottom:
                "1px solid rgba(255,115,60,0.18)",
            }}
          />
        </div>
      ) : null}
    </span>
  );
}