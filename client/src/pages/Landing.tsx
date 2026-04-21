import React from "react";
import { Link } from "wouter";
import {
  Briefcase,
  ClipboardList,
  Receipt,
  Users,
  ArrowRight,
} from "lucide-react";

/**
 * Casa Bruja Compras landing page. Four tiles matching the sidebar
 * sections — this is the first screen Jean sees on compras.casabruja.com.
 *
 * Tiles link to pages that exist today (Personal Eventual) or are coming
 * in Phase 1c/1d (Órdenes de Compra, Fletes y Gastos) and Phase 1b
 * (Servicios Profesionales extraction from Home.tsx).
 */

const CYAN = "oklch(0.75 0.15 200)";
const INK = "oklch(0.15 0 0)";
const MUTED = "oklch(0.55 0 0)";

type Tile = {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  description: string;
  path: string;
  accent: string;
};

const tiles: Tile[] = [
  {
    icon: ClipboardList,
    label: "Órdenes de Compra",
    description:
      "Crea OC, sube facturas, calcula costos aterrizados y recibe inventario.",
    path: "/purchase-orders",
    accent: "oklch(0.65 0.17 200)",
  },
  {
    icon: Receipt,
    label: "Fletes y Gastos",
    description:
      "Pool de facturas de costo: fletes, aduanas, comisiones. Se asignan a las OC.",
    path: "/cost-invoices",
    accent: "oklch(0.7 0.18 60)",
  },
  {
    icon: Briefcase,
    label: "Servicios Profesionales",
    description:
      "Facturación a clientes por servicios profesionales. Genera PDF / XLSX.",
    path: "/servicios-profesionales",
    accent: "oklch(0.65 0.17 150)",
  },
  {
    icon: Users,
    label: "Personal Eventual",
    description:
      "Pagos a trabajadores eventuales, tarifas por departamento, historial de lotes.",
    path: "/personal",
    accent: "oklch(0.55 0.18 280)",
  },
];

export default function Landing() {
  return (
    <div
      style={{
        padding: "2rem 1.5rem 4rem",
        maxWidth: "1100px",
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: "2rem" }}>
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            color: INK,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Compras y Personal · Casa Bruja
        </h1>
        <p
          style={{
            fontSize: "0.9375rem",
            color: MUTED,
            marginTop: "0.5rem",
            maxWidth: "640px",
          }}
        >
          Centro de operaciones del departamento de compras. Aquí gestionamos
          órdenes de compra, facturas de fletes/gastos, servicios profesionales
          facturados a clientes, y pagos a personal eventual.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1rem",
        }}
      >
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.path}
              href={t.path}
              style={{
                background: "oklch(1 0 0)",
                border: "1px solid oklch(0.9 0 0)",
                borderRadius: "12px",
                padding: "1.25rem",
                textDecoration: "none",
                color: INK,
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                transition: "all 0.15s",
                cursor: "pointer",
                borderLeft: `4px solid ${t.accent}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = t.accent;
                e.currentTarget.style.boxShadow =
                  "0 4px 16px oklch(0.5 0.05 0 / 0.08)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "oklch(0.9 0 0)";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                }}
              >
                <span
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "8px",
                    background: t.accent,
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={18} />
                </span>
                <span
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {t.label}
                </span>
              </div>
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: MUTED,
                  lineHeight: 1.5,
                  margin: 0,
                  flex: 1,
                }}
              >
                {t.description}
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  color: CYAN,
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  marginTop: "0.25rem",
                }}
              >
                Abrir <ArrowRight size={12} />
              </div>
            </Link>
          );
        })}
      </div>

      <footer
        style={{
          marginTop: "3rem",
          fontSize: "0.7rem",
          color: MUTED,
          textAlign: "center",
        }}
      >
        Necesitas ayuda? Casa Bruja ERP ·{" "}
        <a
          href="https://facturacion.casabruja.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: MUTED, textDecoration: "underline" }}
        >
          facturacion.casabruja.com
        </a>{" "}
        ·{" "}
        <a
          href="https://brewery.casabruja.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: MUTED, textDecoration: "underline" }}
        >
          brewery.casabruja.com
        </a>
      </footer>
    </div>
  );
}
