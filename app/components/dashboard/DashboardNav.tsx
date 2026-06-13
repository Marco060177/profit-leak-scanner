type Props = {
  active:
  | "overview"
  | "products"
  | "profit"
  | "recommendations"
  | "ai-advisor"
  | "recovery-simulator"
  | "billing";
  navigate: (path: string) => void;
};

export default function DashboardNav({ active, navigate }: Props) {
  const items = [
    { id: "overview", label: "Overview", path: "/app" },
    { id: "products", label: "Products", path: "/app/products" },
    { id: "profit", label: "Profit Intelligence", path: "/app/profit-intelligence" },
    { id: "recommendations", label: "Recommendations", path: "/app/recommendations" },

    { id: "ai-advisor", label: "AI Advisor", path: "/app/ai-advisor" },
    {
      id: "recovery-simulator",
      label: "Recovery",
      path: "/app/recovery-simulator",
    },
    { id: "billing", label: "Billing", path: "/app/billing" },
  ] as const;

  return (
    <div className="navbar">
      <div className="logo">
        MARGIN<span>LAB</span>
      </div>

      <div className="nav-tabs">
        {items.map((item) => (
          <div
            key={item.id}
            className={active === item.id ? "nav-tab active" : "nav-tab"}
            onClick={() => active !== item.id && navigate(item.path)}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}