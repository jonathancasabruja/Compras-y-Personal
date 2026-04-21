import React from "react";
import { Receipt, ExternalLink } from "lucide-react";

/**
 * Fletes y Gastos (renamed from Cost Invoices) — placeholder until Phase 1d
 * ports the full feature from brewery_dashboard.
 */
export default function CostInvoicesPage() {
  return (
    <div style={{ padding: "2rem 1.5rem", maxWidth: "900px", margin: "0 auto" }}>
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 800,
          color: "oklch(0.15 0 0)",
          margin: "0 0 0.5rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <Receipt size={22} style={{ color: "oklch(0.7 0.18 60)" }} />
        Fletes y Gastos
      </h1>
      <p style={{ color: "oklch(0.55 0 0)", fontSize: "0.9375rem", marginTop: "0.5rem" }}>
        Pool de facturas de fletes, aduanas, comisiones y otros gastos que se asignan a
        las Órdenes de Compra. Migrando desde brewery.casabruja.com.
      </p>
      <a
        href="https://brewery.casabruja.com/cost-invoices"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          marginTop: "1.5rem",
          background: "oklch(0.7 0.18 60)",
          color: "white",
          padding: "0.625rem 1rem",
          borderRadius: "8px",
          fontSize: "0.875rem",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Ir a Fletes y Gastos (brewery) <ExternalLink size={14} />
      </a>
    </div>
  );
}
