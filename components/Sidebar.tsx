"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, icons } from "./Icon";

const navItems = [
  { id: "config", href: "/config", label: "Brand Config", icon: icons.settings },
  { id: "topics", href: "/topics", label: "Topic Database", icon: icons.lightbulb },
  { id: "review", href: "/review", label: "Review Queue", icon: icons.clipboard },
  { id: "connections", href: "/connections", label: "Connections", icon: icons.link },
  { id: "admin", href: "/admin", label: "Admin", icon: icons.send },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <Link href="/topics" className="sidebar-logo" style={{ textDecoration: "none", color: "inherit" }}>
        <div className="sidebar-logo-icon">
          <Icon d={icons.spark} size={14} fill="currentColor" stroke="none" />
        </div>
        SPH AI
      </Link>

      <div className="sidebar-label">Navigation</div>
      {navItems.map((n) => {
        const isActive = pathname === n.href;
        return (
          <Link
            key={n.id}
            href={n.href}
            className={`nav-item${isActive ? " active" : ""}`}
          >
            <Icon d={n.icon} size={15} />
            {n.label}
          </Link>
        );
      })}

      <div style={{ flex: 1 }} />
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 8 }}>
        <div style={{ fontSize: 11.5, color: "var(--text3)", padding: "0 10px" }}>
          <div style={{ fontWeight: 600, color: "var(--text2)", marginBottom: 2 }}>
            SPH AI
          </div>
          <div>Powered by Gemini</div>
          <div style={{ marginTop: 6 }}>
            <span
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent)",
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 99,
                border: "1px solid var(--accent-glow)",
              }}
            >
              ● Local
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
