import { useNavigate } from "react-router";

type Props = {
  active: "overview" | "products" | "recommendations" | "profit" | "billing";
};

export default function DashboardSidebar({ active }: Props) {
  const navigate = useNavigate();

  const items = [
    { id: "overview", label: "Overview", path: "/app" },
    { id: "products", label: "Products", path: "/app/products" },
    { id: "recommendations", label: "Recommendations", path: "/app/recommendations" },
    { id: "profit", label: "Profit Intelligence", path: "/app/profit-intelligence" },
    { id: "billing", label: "Billing", path: "/app/billing" },
  ] as const;

  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-logo">
        MARGIN<span>LAB</span>
      </div>

      <div className="sidebar-section-label">Workspace</div>

      <nav className="sidebar-nav">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              active === item.id
                ? "sidebar-nav-item active"
                : "sidebar-nav-item"
            }
            onClick={() => navigate(item.path)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-status-dot" />
        Live analysis
      </div>
    </aside>
  );
}