import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FolderOpen,
  Upload,
  Search,
  Loader2,
  FileText,
  Trash2,
  ExternalLink,
  Tag,
  X,
  Sparkles,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import {
  listInvoiceLibrary,
  invoiceLibraryCounts,
  uploadToInvoiceLibrary,
  updateInvoiceInLibrary,
  deleteInvoiceFromLibrary,
  isInvoiceLibraryReady,
  INVOICE_CATEGORIES,
  CATEGORY_LABELS,
  type InvoiceCategory,
  type SupplierInvoice,
} from "@/lib/supabase";
import { compressPdfClientSide, formatBytes } from "@/lib/pdfCompress";

// ───────────────────────────────────────────────────────────────────────────
// Repositorio de Facturas — master library for every supplier PDF.
//
// Upload → AI classifies (brewing / taproom / utilities / services / ...) +
// extracts supplier + date + total + line items. File is renamed on disk to
// `{supplier}-{date}.pdf` and stored under `invoices/<category>/`.
//
// Side nav filters to a single category; invoices that already seeded an OC
// or a Fletes row show a subtle backlink chip so the operator doesn't
// accidentally re-use them.
// ───────────────────────────────────────────────────────────────────────────

const INK = "oklch(0.15 0 0)";
const MUTED = "oklch(0.55 0 0)";
const BORDER = "oklch(0.9 0 0)";
const SOFT = "oklch(0.98 0 0)";

const CATEGORY_COLORS: Record<InvoiceCategory, { bg: string; fg: string; accent: string }> = {
  brewing_raw_materials: { bg: "oklch(0.94 0.08 85)",  fg: "oklch(0.4 0.15 70)",   accent: "oklch(0.7 0.18 70)" },
  brewing_packaging:     { bg: "oklch(0.93 0.08 125)", fg: "oklch(0.35 0.15 130)", accent: "oklch(0.6 0.17 125)" },
  brewing_equipment:     { bg: "oklch(0.94 0.05 40)",  fg: "oklch(0.4 0.15 30)",   accent: "oklch(0.6 0.18 35)" },
  logistics:             { bg: "oklch(0.93 0.08 60)",  fg: "oklch(0.4 0.18 55)",   accent: "oklch(0.7 0.2 55)" },
  taproom_food:          { bg: "oklch(0.93 0.1 25)",   fg: "oklch(0.4 0.2 25)",    accent: "oklch(0.6 0.2 25)" },
  taproom_beverages:     { bg: "oklch(0.93 0.08 280)", fg: "oklch(0.35 0.18 280)", accent: "oklch(0.55 0.2 280)" },
  taproom_supplies:      { bg: "oklch(0.94 0.05 200)", fg: "oklch(0.35 0.15 200)", accent: "oklch(0.55 0.15 200)" },
  utilities:             { bg: "oklch(0.94 0.05 240)", fg: "oklch(0.35 0.15 240)", accent: "oklch(0.55 0.17 240)" },
  services:              { bg: "oklch(0.94 0.05 300)", fg: "oklch(0.35 0.15 300)", accent: "oklch(0.55 0.17 300)" },
  rent_facility:         { bg: "oklch(0.94 0.04 150)", fg: "oklch(0.35 0.12 150)", accent: "oklch(0.55 0.15 150)" },
  other:                 { bg: "oklch(0.95 0.01 0)",   fg: "oklch(0.35 0 0)",      accent: "oklch(0.55 0 0)" },
};

export default function InvoiceLibraryPage() {
  const [filter, setFilter] = useState<InvoiceCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<SupplierInvoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [readiness, setReadiness] = useState<{ configured: boolean; storage: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [list, cs] = await Promise.all([
        listInvoiceLibrary({ category: filter === "all" ? undefined : filter, search: search || undefined }),
        invoiceLibraryCounts(),
      ]);
      setRows(list);
      setCounts(cs);
    } catch (e: any) {
      toast.error(e?.message ?? "Error cargando el repositorio");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    isInvoiceLibraryReady().then(setReadiness).catch(() => setReadiness({ configured: false, storage: false }));
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Search filter runs client-side for instant feedback
  const visible = useMemo(() => {
    if (!rows) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.supplier, r.invoiceNumber, r.briefDescription, r.storedFilename, r.originalFilename]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(needle)),
    );
  }, [rows, search]);

  const selected = useMemo(
    () => (selectedId && rows ? rows.find((r) => r.id === selectedId) ?? null : null),
    [selectedId, rows],
  );

  const doUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const file of Array.from(files)) {
        try {
          if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
            toast.error(`${file.name}: solo PDF`);
            fail++;
            continue;
          }
          if (file.size > 20 * 1024 * 1024) {
            toast.error(`${file.name}: muy grande (máx 20 MB antes de comprimir)`);
            fail++;
            continue;
          }
          const compressed = await compressPdfClientSide(file);
          if (compressed.compressed) {
            toast.info(
              `${file.name}: ${formatBytes(compressed.originalSize)} → ${formatBytes(compressed.compressedSize)}`,
              { duration: 2500 },
            );
          }
          if (compressed.file.size > 8 * 1024 * 1024) {
            toast.error(`${file.name}: sigue muy grande tras comprimir`);
            fail++;
            continue;
          }
          const result = await uploadToInvoiceLibrary(compressed.file);
          if (result.invoice) {
            ok++;
            const cat = CATEGORY_LABELS[result.invoice.category].es;
            toast.success(
              `${result.invoice.supplier || "—"}: ${cat}${result.invoice.invoiceDate ? ` · ${result.invoice.invoiceDate}` : ""}`,
              { duration: 3500 },
            );
          } else {
            fail++;
          }
        } catch (err: any) {
          fail++;
          toast.error(`${file.name}: ${err?.message ?? "error"}`);
        }
      }
      await refresh();
    } finally {
      setUploading(false);
      if (ok > 0 && fail === 0) toast.success(`${ok} factura(s) subidas al repositorio`);
    }
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1300, margin: "0 auto", display: "grid", gridTemplateColumns: "260px 1fr", gap: "1rem", alignItems: "start" }}>
      {/* Header spans */}
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 800, color: INK, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FolderOpen size={20} style={{ color: "oklch(0.55 0.18 260)" }} />
            Repositorio de Facturas
          </h1>
          <p style={{ color: MUTED, fontSize: "0.875rem", margin: "0.25rem 0 0" }}>
            Todas las facturas de proveedor en un solo lugar. La IA clasifica por categoría y extrae los datos automáticamente.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            multiple
            style={{ display: "none" }}
            onChange={(e) => doUpload(e.target.files)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={btnPrimary}
          >
            {uploading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={14} />}
            {uploading ? "Subiendo…" : "Subir facturas"}
          </button>
        </div>
      </div>

      {readiness && (!readiness.configured || !readiness.storage) && (
        <div style={{ gridColumn: "1 / -1", padding: "0.625rem 0.875rem", background: "oklch(0.95 0.08 85)", border: `1px solid oklch(0.88 0.08 85)`, borderRadius: 8, color: "oklch(0.35 0.15 70)", fontSize: "0.8125rem" }}>
          ⚠️ {!readiness.configured && "OPENAI_API_KEY no configurada. "}{!readiness.storage && "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados en Railway."}
        </div>
      )}

      {/* Left rail: category filter */}
      <aside style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden", position: "sticky", top: "1rem", maxHeight: "calc(100vh - 3rem)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0.75rem", borderBottom: `1px solid ${BORDER}`, background: SOFT, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Tag size={14} style={{ color: MUTED }} />
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: INK, textTransform: "uppercase", letterSpacing: "0.05em" }}>Categorías</span>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          <CategoryPill active={filter === "all"} label="Todas" count={counts.all ?? 0} color={CATEGORY_COLORS.other} onClick={() => setFilter("all")} />
          <GroupHeader label="Cervecería" />
          {(["brewing_raw_materials", "brewing_packaging", "brewing_equipment"] as const).map((k) => (
            <CategoryPill key={k} active={filter === k} label={CATEGORY_LABELS[k].es} count={counts[k] ?? 0} color={CATEGORY_COLORS[k]} onClick={() => setFilter(k)} />
          ))}
          <GroupHeader label="Logística" />
          <CategoryPill active={filter === "logistics"} label={CATEGORY_LABELS.logistics.es} count={counts.logistics ?? 0} color={CATEGORY_COLORS.logistics} onClick={() => setFilter("logistics")} />
          <GroupHeader label="Taproom" />
          {(["taproom_food", "taproom_beverages", "taproom_supplies"] as const).map((k) => (
            <CategoryPill key={k} active={filter === k} label={CATEGORY_LABELS[k].es} count={counts[k] ?? 0} color={CATEGORY_COLORS[k]} onClick={() => setFilter(k)} />
          ))}
          <GroupHeader label="Gastos Generales" />
          {(["utilities", "services", "rent_facility"] as const).map((k) => (
            <CategoryPill key={k} active={filter === k} label={CATEGORY_LABELS[k].es} count={counts[k] ?? 0} color={CATEGORY_COLORS[k]} onClick={() => setFilter(k)} />
          ))}
          <GroupHeader label="Otro" />
          <CategoryPill active={filter === "other"} label={CATEGORY_LABELS.other.es} count={counts.other ?? 0} color={CATEGORY_COLORS.other} onClick={() => setFilter("other")} />
        </div>
      </aside>

      {/* Main pane */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar proveedor, número, descripción o archivo…"
            style={{ padding: "0.5rem 0.75rem 0.5rem 32px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: "0.875rem", width: "100%" }}
          />
        </div>

        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden", background: "white" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead style={{ background: SOFT }}>
              <tr>
                <Th>Archivo</Th>
                <Th>Proveedor</Th>
                <Th>Descripción</Th>
                <Th>Fecha</Th>
                <Th style={{ textAlign: "right" }}>Total</Th>
                <Th>Categoría</Th>
                <Th>Enlace</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !rows && (
                <tr><td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: MUTED }}><Loader2 size={14} style={{ display: "inline", marginRight: 6, animation: "spin 1s linear infinite" }} />Cargando…</td></tr>
              )}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: MUTED }}>
                  {rows && rows.length === 0 ? "Repositorio vacío. Sube una factura para empezar." : "Ningún resultado."}
                </td></tr>
              )}
              {visible.map((r) => {
                const c = CATEGORY_COLORS[r.category];
                return (
                  <tr key={r.id} style={{ borderTop: `1px solid ${BORDER}`, cursor: "pointer" }} onClick={() => setSelectedId(r.id)}>
                    <Td style={{ fontSize: "0.75rem", color: MUTED, fontFamily: "monospace", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <FileText size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "-2px" }} />
                      {r.storedFilename || r.originalFilename}
                    </Td>
                    <Td style={{ fontWeight: 600, color: INK }}>{r.supplier || "—"}</Td>
                    <Td style={{ color: MUTED, fontSize: "0.75rem", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.briefDescription || "—"}</Td>
                    <Td style={{ color: MUTED }}>{r.invoiceDate || "—"}</Td>
                    <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{r.totalAmount != null ? `${(r.currency || "USD")} ${r.totalAmount.toFixed(2)}` : "—"}</Td>
                    <Td>
                      <span style={{ background: c.bg, color: c.fg, padding: "2px 8px", borderRadius: 999, fontSize: "0.6875rem", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {CATEGORY_LABELS[r.category].es}
                      </span>
                    </Td>
                    <Td>
                      {r.usedInPoId ? (
                        <span style={{ fontSize: "0.6875rem", color: "oklch(0.4 0.15 150)", fontWeight: 600 }}>
                          <Link2 size={11} style={{ display: "inline", marginRight: 3, verticalAlign: "-1px" }} />
                          OC #{r.usedInPoId}
                        </span>
                      ) : r.usedInCostInvoiceId ? (
                        <span style={{ fontSize: "0.6875rem", color: "oklch(0.4 0.15 70)", fontWeight: 600 }}>
                          <Link2 size={11} style={{ display: "inline", marginRight: 3, verticalAlign: "-1px" }} />
                          Flete #{r.usedInCostInvoiceId}
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.6875rem", color: MUTED, fontStyle: "italic" }}>libre</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <InvoiceDetailDrawer invoice={selected} onClose={() => setSelectedId(null)} onChanged={refresh} />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function GroupHeader({ label }: { label: string }) {
  return (
    <div style={{ padding: "0.5rem 0.75rem 0.25rem", fontSize: "0.65rem", fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {label}
    </div>
  );
}

function CategoryPill({
  active,
  label,
  count,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  color: { bg: string; fg: string; accent: string };
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.4rem 0.75rem",
        border: "none",
        borderLeft: active ? `3px solid ${color.accent}` : "3px solid transparent",
        background: active ? color.bg : "white",
        color: active ? color.fg : INK,
        cursor: "pointer",
        fontSize: "0.8125rem",
        textAlign: "left",
      }}
    >
      <span style={{ flex: 1, fontWeight: active ? 700 : 500 }}>{label}</span>
      <span style={{ color: MUTED, fontSize: "0.6875rem" }}>{count}</span>
    </button>
  );
}

function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", fontSize: "0.6875rem", fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${BORDER}`, ...style }}>{children}</th>;
}

function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "0.5rem 0.75rem", verticalAlign: "middle", ...style }}>{children}</td>;
}

// ───────────────────────────────────────────────────────────────────────────

function InvoiceDetailDrawer({
  invoice,
  onClose,
  onChanged,
}: {
  invoice: SupplierInvoice;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [supplier, setSupplier] = useState(invoice.supplier ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoiceNumber ?? "");
  const [date, setDate] = useState(invoice.invoiceDate ?? "");
  const [category, setCategory] = useState<InvoiceCategory>(invoice.category);
  const [description, setDescription] = useState(invoice.briefDescription ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateInvoiceInLibrary(invoice.id, {
        supplier: supplier.trim() || null,
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDate: date.trim() || null,
        category,
        briefDescription: description.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Factura actualizada");
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirm(`¿Eliminar factura ${invoice.storedFilename ?? invoice.id} del repositorio? El archivo se borra también del almacenamiento.`)) return;
    setDeleting(true);
    try {
      await deleteInvoiceFromLibrary(invoice.id);
      toast.success("Factura eliminada");
      onClose();
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Error eliminando");
    } finally {
      setDeleting(false);
    }
  };

  const items = invoice.extractedData?.items ?? [];
  const extras = invoice.extractedData?.extraCosts ?? [];

  return (
    <div style={drawerOverlay} onClick={onClose}>
      <div style={drawerPanel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <div style={{ fontSize: "0.75rem", color: MUTED }}>Factura</div>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 800, color: INK, margin: 0 }}>{invoice.storedFilename || invoice.originalFilename}</h2>
          </div>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>

        <div style={{ padding: "1rem 1.25rem", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <Field label="Proveedor">
              <input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Número factura">
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Fecha">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Categoría">
              <select value={category} onChange={(e) => setCategory(e.target.value as InvoiceCategory)} style={inputStyle}>
                {INVOICE_CATEGORIES.map((k) => (
                  <option key={k} value={k}>{CATEGORY_LABELS[k].es}</option>
                ))}
              </select>
            </Field>
            <Field label="Descripción breve" style={{ gridColumn: "span 2" }}>
              <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Notas" style={{ gridColumn: "span 2" }}>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} />
            </Field>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
            {invoice.fileUrl ? (
              <a href={invoice.fileUrl} target="_blank" rel="noopener noreferrer" style={{ ...btnSecondary, textDecoration: "none" }}>
                <ExternalLink size={14} /> Abrir PDF
              </a>
            ) : (
              <span style={{ color: MUTED, fontSize: "0.75rem", fontStyle: "italic" }}>
                Sin copia en la nube (almacenamiento no configurado al subir)
              </span>
            )}
          </div>

          {invoice.extractedData && (
            <div style={{ marginTop: "1.25rem" }}>
              <h3 style={{ fontSize: "0.75rem", fontWeight: 800, color: INK, margin: "0 0 0.5rem", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={12} style={{ color: "oklch(0.55 0.18 260)" }} />
                Datos extraídos por IA
              </h3>
              {items.length > 0 && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <div style={{ fontSize: "0.6875rem", color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Líneas ({items.length})</div>
                  <table style={miniTable}>
                    <thead><tr><Th>Código</Th><Th>Descripción</Th><Th style={{ textAlign: "right" }}>Cant.</Th><Th>U.</Th><Th style={{ textAlign: "right" }}>Precio u.</Th><Th style={{ textAlign: "right" }}>Total</Th></tr></thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i}>
                          <Td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{it.productCode || "—"}</Td>
                          <Td>{it.productDescription}</Td>
                          <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{it.qty}</Td>
                          <Td>{it.unit}</Td>
                          <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{it.unitPrice.toFixed(4)}</Td>
                          <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{it.totalPrice.toFixed(2)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {extras.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.6875rem", color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Costos extra</div>
                  <table style={miniTable}>
                    <thead><tr><Th>Tipo</Th><Th>Descripción</Th><Th style={{ textAlign: "right" }}>Monto</Th></tr></thead>
                    <tbody>
                      {extras.map((ec, i) => (
                        <tr key={i}>
                          <Td>{ec.costType}</Td>
                          <Td>{ec.description}</Td>
                          <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{ec.amount.toFixed(2)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "0.75rem 1.25rem", borderTop: `1px solid ${BORDER}`, display: "flex", gap: "0.5rem", justifyContent: "space-between" }}>
          <button onClick={doDelete} disabled={deleting} style={btnDanger}>
            <Trash2 size={14} /> Eliminar
          </button>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onClose} disabled={saving} style={btnSecondary}>Cancelar</button>
            <button onClick={save} disabled={saving} style={btnPrimary}>
              {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : null}
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: MUTED }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.4375rem 0.625rem",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  fontSize: "0.8125rem",
  width: "100%",
  boxSizing: "border-box",
  background: "white",
  color: INK,
};

const btnBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0.5rem 0.75rem",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  background: "white",
  color: INK,
  fontSize: "0.8125rem",
  fontWeight: 600,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: "oklch(0.55 0.18 260)",
  color: "white",
  borderColor: "oklch(0.55 0.18 260)",
};

const btnSecondary: React.CSSProperties = { ...btnBase };

const btnDanger: React.CSSProperties = {
  ...btnBase,
  background: "oklch(0.96 0.04 25)",
  color: "oklch(0.4 0.2 25)",
  borderColor: "oklch(0.88 0.08 25)",
};

const iconBtn: React.CSSProperties = { ...btnBase, padding: "0.375rem", background: "transparent", border: "none", color: MUTED };

const drawerOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "oklch(0.15 0 0 / 0.4)",
  display: "flex",
  justifyContent: "flex-end",
  zIndex: 50,
};

const drawerPanel: React.CSSProperties = {
  background: "white",
  width: "100%",
  maxWidth: 720,
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 0 40px oklch(0.3 0 0 / 0.2)",
};

const miniTable: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.75rem",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  overflow: "hidden",
};
