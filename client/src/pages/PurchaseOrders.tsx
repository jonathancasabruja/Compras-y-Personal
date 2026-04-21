import React from "react";
import { ClipboardList, ExternalLink } from "lucide-react";

/**
 * Órdenes de Compra — placeholder until Phase 1c/1d ports the full feature
 * from brewery_dashboard. While this page is empty, OC still lives at
 * brewery.casabruja.com/purchase-orders for the purchasing team.
 */
export default function PurchaseOrdersPage() {
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
        <ClipboardList size={22} style={{ color: "oklch(0.65 0.17 200)" }} />
        Órdenes de Compra
      </h1>
      <p style={{ color: "oklch(0.55 0 0)", fontSize: "0.9375rem", marginTop: "0.5rem" }}>
        Esta sección se está migrando desde brewery.casabruja.com. Mientras tanto, usa el enlace de abajo para crear y recibir OC.
      </p>
      <a
        href="https://brewery.casabruja.com/purchase-orders"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          marginTop: "1.5rem",
          background: "oklch(0.65 0.17 200)",
          color: "white",
          padding: "0.625rem 1rem",
          borderRadius: "8px",
          fontSize: "0.875rem",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Ir a Órdenes de Compra (brewery) <ExternalLink size={14} />
      </a>
    </div>
  );
}
