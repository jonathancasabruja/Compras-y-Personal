import React, { useEffect, useMemo, useState } from "react";
import {
  listInvoiceLibrary,
  CATEGORY_LABELS,
  type InvoiceCategory,
  type SupplierInvoice,
} from "@/lib/supabase";
import { Search, X, FolderOpen, Link2, FileText, ExternalLink, Loader2 } from "lucide-react";

/**
 * Modal picker: choose an invoice from the Repositorio de Facturas. Filters
 * to a category whitelist (brewing_* for OC, logistics for Fletes) and
 * de-emphasises invoices that are already linked to another record.
 *
 * The caller passes onPick(invoice) and the SupplierInvoice comes back with
 * extractedData attached — so the OC/Fletes form can pre-fill in one shot,
 * no new AI call, no second network round-trip.
 */

const INK = "oklch(0.15 0 0)";
const MUTED = "oklch(0.55 0 0)";
const BORDER = "oklch(0.9 0 0)";
const SOFT = "oklch(0.98 0 0)";
const CYAN = "oklch(0.65 0.17 200)";
const ORANGE = "oklch(0.7 0.18 60)";

export function InvoiceLibraryPicker({
  allowedCategories,
  onClose,
  onPick,
  title = "Seleccionar factura del repositorio",
  accent = CYAN,
}: {
  allowedCategories: InvoiceCategory[];
  onClose: () => void;
  onPick: (invoice: SupplierInvoice) => void;
  title?: string;
  accent?: string;
}) {
  const [rows, setRows] = useState<SupplierInvoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<InvoiceCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [showUsed, setShowUsed] = useState(false);

  const loadRows = async () => {
    setLoading(true);
    try {
      // Pull the union across allowed categories. The library's list()
      // endpoint takes a single category filter, so we fan out client-side.
      const results = await Promise.all(
        allowedCategories.map((cat) => listInvoiceLibrary({ category: cat })),
      );
      const merged = results.flat();
      merged.sort((a, b) => (b.uploadedAt > a.uploadedAt ? 1 : -1));
      setRows(merged);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedCategories.join(",")]);

  const visible = useMemo(() => {
    const all = rows ?? [];
    const needle = search.trim().toLowerCase();
    return all.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (!showUsed && (r.usedInPoId || r.usedInCostInvoiceId)) return false;
      if (needle) {
        const hay = [r.supplier, r.invoiceNumber, r.briefDescription, r.storedFilename, r.originalFilename]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, category, search, showUsed]);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FolderOpen size={18} style={{ color: accent }} />
            <h2 style={{ fontSize: "1rem", fontWeight: 800, color: INK, margin: 0 }}>{title}</h2>
          </div>
          <button onClick={onClose} style={iconBtn} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "0.75rem 1rem", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Proveedor, número, descripción…"
              style={{ padding: "0.5rem 0.75rem 0.5rem 32px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: "0.875rem", width: "100%" }}
              autoFocus
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as InvoiceCategory | "all")}
            style={{ padding: "0.5rem 0.625rem", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: "0.8125rem", background: "white" }}
          >
            <option value="all">Todas las categorías permitidas</option>
            {allowedCategories.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c].es}</option>
            ))}
          </select>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: MUTED }}>
            <input type="checkbox" checked={showUsed} onChange={(e) => setShowUsed(e.target.checked)} />
            Mostrar ya asignadas
          </label>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && (!rows || rows.length === 0) && (
            <div style={{ padding: "1.5rem", textAlign: "center", color: MUTED, fontSize: "0.8125rem" }}>
              <Loader2 size={14} style={{ display: "inline", marginRight: 6, animation: "spin 1s linear infinite" }} />
              Cargando…
            </div>
          )}
          {!loading && visible.length === 0 && (
            <div style={{ padding: "2rem", textAlign: "center", color: MUTED, fontSize: "0.875rem" }}>
              <FolderOpen size={28} style={{ color: MUTED, marginBottom: "0.5rem" }} />
              <div>
                {rows && rows.length === 0
                  ? "El repositorio está vacío. Sube una factura primero desde la página del Repositorio."
                  : "Ningún resultado con los filtros actuales."}
              </div>
            </div>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {visible.map((r) => {
              const isUsed = !!r.usedInPoId || !!r.usedInCostInvoiceId;
              return (
                <li
                  key={r.id}
                  onClick={() => onPick(r)}
                  style={{
                    padding: "0.625rem 0.875rem",
                    borderBottom: `1px solid ${BORDER}`,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    opacity: isUsed ? 0.55 : 1,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = SOFT)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                >
                  <FileText size={16} style={{ color: MUTED, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.supplier || "—"}
                      </div>
                      <span
                        style={{
                          background: "oklch(0.94 0.05 200)",
                          color: "oklch(0.35 0.15 200)",
                          padding: "1px 7px",
                          borderRadius: 999,
                          fontSize: "0.65rem",
                          fontWeight: 700,
                        }}
                      >
                        {CATEGORY_LABELS[r.category].es}
                      </span>
                      {isUsed && (
                        <span style={{ fontSize: "0.65rem", color: "oklch(0.45 0.15 150)", fontWeight: 700 }}>
                          <Link2 size={10} style={{ display: "inline", marginRight: 2, verticalAlign: "-1px" }} />
                          {r.usedInPoId ? `OC #${r.usedInPoId}` : `Flete #${r.usedInCostInvoiceId}`}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: MUTED, marginTop: 2 }}>
                      {r.briefDescription ? `${r.briefDescription} · ` : ""}
                      {r.invoiceNumber ? `${r.invoiceNumber} · ` : ""}
                      {r.invoiceDate || "—"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {r.totalAmount != null && (
                      <div style={{ fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums" }}>
                        {(r.currency || "USD")} {r.totalAmount.toFixed(2)}
                      </div>
                    )}
                    {r.fileUrl && (
                      <a
                        href={r.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: MUTED, fontSize: "0.65rem" }}
                      >
                        PDF <ExternalLink size={9} style={{ display: "inline" }} />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div style={{ padding: "0.625rem 1rem", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: SOFT }}>
          <span style={{ fontSize: "0.7rem", color: MUTED }}>
            {visible.length} factura(s) disponibles
          </span>
          <button onClick={onClose} style={{ padding: "0.4rem 0.75rem", border: `1px solid ${BORDER}`, borderRadius: 6, background: "white", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "oklch(0.15 0 0 / 0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 55,
  backdropFilter: "blur(2px)",
};

const panel: React.CSSProperties = {
  background: "white",
  width: "100%",
  maxWidth: 700,
  maxHeight: "85vh",
  borderRadius: 12,
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 8px 40px oklch(0.3 0 0 / 0.2)",
  overflow: "hidden",
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0.875rem 1rem",
  borderBottom: `1px solid ${BORDER}`,
};

const iconBtn: React.CSSProperties = {
  padding: "0.375rem",
  border: "none",
  background: "transparent",
  color: MUTED,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};
