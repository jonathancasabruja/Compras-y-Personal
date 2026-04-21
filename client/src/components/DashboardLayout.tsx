import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Home as HomeIcon,
  Briefcase,
  ClipboardList,
  Receipt,
  Users,
  PanelLeft,
} from "lucide-react";

/**
 * Lightweight sidebar + content layout for Compras y Personal. Mirrors the
 * facturacion-cb pattern so the ERP family looks consistent.
 *
 * Sections (Nov 2026):
 *   - Inicio — landing with tiles
 *   - Servicios Profesionales — the existing invoice/lote flow (was Home.tsx)
 *   - Órdenes de Compra — ported from brewery_dashboard
 *   - Fletes y Gastos — renamed cost_invoices from brewery_dashboard
 *   - Personal Eventual — existing personas / tarifas / pagos
 */

const CYAN = "oklch(0.75 0.15 200)";
const INK = "oklch(0.15 0 0)";
const MUTED = "oklch(0.55 0 0)";

type NavItem = {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  path: string;
};

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "GENERAL",
    items: [{ icon: HomeIcon, label: "Inicio", path: "/" }],
  },
  {
    label: "COMPRAS",
    items: [
      {
        icon: ClipboardList,
        label: "Órdenes de Compra",
        path: "/purchase-orders",
      },
      { icon: Receipt, label: "Fletes y Gastos", path: "/cost-invoices" },
    ],
  },
  {
    label: "PERSONAL",
    items: [
      {
        icon: Briefcase,
        label: "Servicios Profesionales",
        path: "/servicios-profesionales",
      },
      { icon: Users, label: "Personal Eventual", path: "/personal" },
    ],
  },
];

const allMenuItems = navGroups.flatMap((g) => g.items);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();

  // Match the longest-prefix path for the active-state highlight, so
  // /purchase-orders/123 still highlights "Órdenes de Compra".
  const activePath = allMenuItems
    .map((i) => i.path)
    .filter((p) => location === p || (p !== "/" && location.startsWith(p + "/")))
    .sort((a, b) => b.length - a.length)[0] ?? location;

  const sidebarWidth = collapsed ? 56 : 220;

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        background: "oklch(0.98 0 0)",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: sidebarWidth,
          background: "oklch(1 0 0)",
          borderRight: "1px solid oklch(0.92 0 0)",
          display: "flex",
          flexDirection: "column",
          transition: "width 0.15s",
          flexShrink: 0,
        }}
      >
        {/* Brand + collapse toggle */}
        <div
          style={{
            height: 56,
            borderBottom: "1px solid oklch(0.92 0 0)",
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            padding: collapsed ? "0" : "0 0.875rem",
            gap: "0.5rem",
          }}
        >
          {!collapsed && (
            <span
              style={{
                fontSize: "0.875rem",
                fontWeight: 800,
                color: INK,
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title="Casa Bruja · Compras y Personal"
            >
              Casa Bruja · Compras
            </span>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            style={{
              background: "transparent",
              border: "none",
              color: MUTED,
              cursor: "pointer",
              padding: "0.375rem",
              display: "flex",
              alignItems: "center",
              borderRadius: "4px",
            }}
            title={collapsed ? "Expandir" : "Colapsar"}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "oklch(0.95 0 0)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "transparent")
            }
          >
            <PanelLeft size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0.5rem 0",
          }}
        >
          {navGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: "0.75rem" }}>
              {!collapsed && (
                <div
                  style={{
                    padding: "0.375rem 0.875rem",
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    color: MUTED,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activePath === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.625rem",
                      padding: collapsed
                        ? "0.55rem 0"
                        : "0.5rem 0.875rem",
                      justifyContent: collapsed ? "center" : "flex-start",
                      color: isActive ? CYAN : "oklch(0.3 0 0)",
                      background: isActive ? "oklch(0.96 0.04 200)" : "transparent",
                      borderLeft: isActive
                        ? `3px solid ${CYAN}`
                        : "3px solid transparent",
                      paddingLeft: collapsed
                        ? "0"
                        : isActive
                          ? "calc(0.875rem - 3px)"
                          : "0.875rem",
                      fontSize: "0.8125rem",
                      fontWeight: isActive ? 600 : 500,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                      transition: "all 0.1s",
                    }}
                    title={collapsed ? item.label : undefined}
                    onMouseEnter={(e) => {
                      if (!isActive)
                        (e.currentTarget as HTMLElement).style.background =
                          "oklch(0.96 0 0)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive)
                        (e.currentTarget as HTMLElement).style.background =
                          "transparent";
                    }}
                  >
                    <Icon size={16} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer — small cross-link */}
        {!collapsed && (
          <div
            style={{
              padding: "0.625rem 0.875rem",
              borderTop: "1px solid oklch(0.92 0 0)",
              fontSize: "0.65rem",
              color: MUTED,
            }}
          >
            <a
              href="https://facturacion.casabruja.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: MUTED,
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              ↗ Facturación ERP
            </a>
            <br />
            <a
              href="https://brewery.casabruja.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: MUTED,
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              ↗ Brewery
            </a>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "auto",
        }}
      >
        {children}
      </main>
    </div>
  );
}
