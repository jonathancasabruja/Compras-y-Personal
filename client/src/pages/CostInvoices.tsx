import React, { useEffect, useMemo, useState } from "react";
import {
  Receipt,
  Plus,
  RefreshCw,
  Trash2,
  X,
  Link2,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  listCostInvoices,
  getCostInvoice,
  createCostInvoice,
  deleteCostInvoice,
  allocateCostInvoice,
  deallocateCostInvoice,
  listPurchaseOrders,
  type CostInvoice,
  type CostInvoiceFull,
  type PurchaseOrder,
} from "@/lib/supabase";

// ───────────────────────────────────────────────────────────────────────────
// Fletes y Gastos — Phase 1d MVP.
//
// This is the pool of invoices that are NOT product purchases: freight,
// customs, comisiones, seguros, manejo. Each invoice can be split across
// multiple POs by % or by fixed amount, which creates matching extra-cost
// lines on the target POs (driving landed-cost recalculation server-side).
// ───────────────────────────────────────────────────────────────────────────

const ORANGE = "oklch(0.7 0.18 60)";
const CYAN = "oklch(0.65 0.17 200)";
const INK = "oklch(0.15 0 0)";
const MUTED = "oklch(0.55 0 0)";
const BORDER = "oklch(0.9 0 0)";
const SOFT = "oklch(0.98 0 0)";

const COST_TYPES = [
  "freight",
  "customs",
  "insurance",
  "handling",
  "logistics",
  "comisiones",
  "other",
] as const;

export default function CostInvoicesPage() {
  const [rows, setRows] = useState<CostInvoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await listCostInvoices();
      setRows(r);
    } catch (e: any) {
      setErr(e?.message ?? "Error cargando facturas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.invoiceNumber.toLowerCase().includes(needle) ||
        r.supplier.toLowerCase().includes(needle) ||
        r.costType.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const selected = useMemo(
    () => (selectedId && rows ? rows.find((r) => r.id === selectedId) ?? null : null),
    [selectedId, rows],
  );

  const totalOutstanding = useMemo(
    () => (rows ? rows.reduce((s, r) => s + r.remainingAmount, 0) : 0),
    [rows],
  );

  return (
    <div style={{ padding: "2rem 1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 800,
              color: INK,
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Receipt size={22} style={{ color: ORANGE }} />
            Fletes y Gastos
          </h1>
          <p style={{ color: MUTED, fontSize: "0.875rem", margin: "0.25rem 0 0" }}>
            Pool de facturas de costo (fletes, aduanas, comisiones, seguros). Asignalas a las OC en porcentaje o monto.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={refresh} style={btnSecondary} disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refrescar
          </button>
          <button onClick={() => setCreating(true)} style={{ ...btnPrimary, background: ORANGE, borderColor: ORANGE }}>
            <Plus size={14} /> Nueva Factura
          </button>
        </div>
      </div>

      {/* Outstanding summary */}
      {rows && rows.length > 0 && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: SOFT,
            borderRadius: 8,
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            marginBottom: "0.75rem",
            border: `1px solid ${BORDER}`,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Por asignar
          </div>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: ORANGE }}>
            ${totalOutstanding.toFixed(2)}
          </div>
          <div style={{ fontSize: "0.75rem", color: MUTED }}>
            {rows.length} factura{rows.length === 1 ? "" : "s"} · {rows.filter((r) => r.remainingAmount > 0.01).length} con saldo
          </div>
        </div>
      )}

      <div style={{ marginBottom: "0.75rem" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por número, proveedor o tipo…"
          style={{
            width: "100%",
            padding: "0.5rem 0.75rem",
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            fontSize: "0.875rem",
          }}
        />
      </div>

      {err && (
        <div
          style={{
            background: "oklch(0.95 0.08 25)",
            color: "oklch(0.4 0.15 25)",
            padding: "0.625rem 0.875rem",
            borderRadius: 8,
            fontSize: "0.8125rem",
            marginBottom: "0.75rem",
          }}
        >
          {err}
        </div>
      )}

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", background: "white" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead style={{ background: SOFT }}>
            <tr>
              <Th>Factura</Th>
              <Th>Proveedor</Th>
              <Th>Tipo</Th>
              <Th>Fecha</Th>
              <Th style={{ textAlign: "right" }}>Total</Th>
              <Th style={{ textAlign: "right" }}>Asignado</Th>
              <Th style={{ textAlign: "right" }}>Por asignar</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows && (
              <tr>
                <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: MUTED }}>
                  <Loader2 size={16} style={{ display: "inline", marginRight: 6, animation: "spin 1s linear infinite" }} />
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: MUTED }}>
                  No hay facturas de costo.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr
                key={r.id}
                style={{ borderTop: `1px solid ${BORDER}`, cursor: "pointer" }}
                onClick={() => setSelectedId(r.id)}
              >
                <Td style={{ fontWeight: 700, color: ORANGE }}>{r.invoiceNumber}</Td>
                <Td>{r.supplier}</Td>
                <Td style={{ color: MUTED }}>{r.costType}</Td>
                <Td style={{ color: MUTED }}>{r.date}</Td>
                <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {r.totalAmount.toFixed(2)} {r.currency}
                </Td>
                <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {r.allocatedAmount.toFixed(2)}
                </Td>
                <Td
                  style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 700,
                    color: r.remainingAmount > 0.01 ? ORANGE : MUTED,
                  }}
                >
                  {r.remainingAmount.toFixed(2)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <CostInvoiceDrawer
          row={selected}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      )}

      {creating && (
        <NewInvoiceDialog
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await refresh();
          }}
        />
      )}

      <style>{spinKeyframes}</style>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function CostInvoiceDrawer({
  row,
  onClose,
  onChanged,
}: {
  row: CostInvoice;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [full, setFull] = useState<CostInvoiceFull | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAllocForm, setShowAllocForm] = useState(false);
  const [pos, setPos] = useState<PurchaseOrder[] | null>(null);
  const [allocPoId, setAllocPoId] = useState<number | null>(null);
  const [allocMode, setAllocMode] = useState<"percentage" | "amount">("percentage");
  const [allocValue, setAllocValue] = useState("");
  const [allocNotes, setAllocNotes] = useState("");
  const [allocRate, setAllocRate] = useState("1");

  const load = async () => {
    try {
      const f = await getCostInvoice(row.id);
      setFull(f);
    } catch (e: any) {
      toast.error(e?.message ?? "Error cargando factura");
    }
  };

  useEffect(() => {
    load();
    listPurchaseOrders().then(setPos).catch(() => setPos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  const doAllocate = async () => {
    if (!allocPoId) return toast.error("Selecciona una OC");
    const v = parseFloat(allocValue);
    if (!isFinite(v) || v <= 0) return toast.error("Valor inválido");
    setBusy(true);
    try {
      await allocateCostInvoice({
        costInvoiceId: row.id,
        purchaseOrderId: allocPoId,
        percentage: allocMode === "percentage" ? v : undefined,
        amount: allocMode === "amount" ? v : undefined,
        notes: allocNotes.trim() || null,
        exchangeRate: parseFloat(allocRate) || 1,
      });
      toast.success("Asignación creada");
      setShowAllocForm(false);
      setAllocValue("");
      setAllocNotes("");
      setAllocPoId(null);
      await load();
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Error asignando");
    } finally {
      setBusy(false);
    }
  };

  const doDeallocate = async (allocId: number) => {
    if (!confirm("¿Quitar esta asignación? Se recalcularán costos aterrizados de la OC.")) return;
    setBusy(true);
    try {
      await deallocateCostInvoice(allocId);
      toast.success("Asignación removida");
      await load();
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!confirm(`¿Eliminar factura ${row.invoiceNumber}?`)) return;
    setBusy(true);
    try {
      await deleteCostInvoice(row.id);
      toast.success("Factura eliminada");
      onClose();
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Error eliminando");
    } finally {
      setBusy(false);
    }
  };

  const invoice = full?.invoice ?? row;
  const allocs = full?.allocations ?? [];

  return (
    <div style={drawerOverlay} onClick={onClose}>
      <div style={drawerPanel} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem 1.25rem",
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", color: MUTED }}>Factura de Costo</div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: INK, margin: 0 }}>{invoice.invoiceNumber}</h2>
          </div>
          <button onClick={onClose} style={iconBtn} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "1rem 1.25rem", overflowY: "auto", flex: 1 }}>
          <div style={summaryGrid}>
            <KV label="Proveedor" value={invoice.supplier} />
            <KV label="Tipo" value={invoice.costType} />
            <KV label="Fecha" value={invoice.date} />
            <KV label="Moneda" value={invoice.currency || "USD"} />
            <KV label="Total" value={`${invoice.totalAmount.toFixed(2)} ${invoice.currency || "USD"}`} />
            <KV label="Asignado" value={invoice.allocatedAmount.toFixed(2)} />
            <KV
              label="Por asignar"
              value={invoice.remainingAmount.toFixed(2)}
              emphasize={invoice.remainingAmount > 0.01}
            />
          </div>

          {invoice.notes && (
            <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: SOFT, borderRadius: 8, fontSize: "0.8125rem" }}>
              <div style={{ fontWeight: 700, color: INK, marginBottom: 4 }}>Notas</div>
              <div style={{ color: MUTED, whiteSpace: "pre-wrap" }}>{invoice.notes}</div>
            </div>
          )}

          <div style={{ marginTop: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: "0.8125rem", fontWeight: 800, color: INK, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Asignaciones ({allocs.length})
            </h3>
            {invoice.remainingAmount > 0.01 && !showAllocForm && (
              <button onClick={() => setShowAllocForm(true)} style={btnPrimary}>
                <Link2 size={14} /> Asignar a OC
              </button>
            )}
          </div>

          {showAllocForm && (
            <div
              style={{
                marginTop: "0.5rem",
                padding: "0.875rem",
                background: SOFT,
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem",
              }}
            >
              <Field label="OC destino" style={{ gridColumn: "span 2" }}>
                <select
                  value={allocPoId ?? ""}
                  onChange={(e) => setAllocPoId(e.target.value ? parseInt(e.target.value) : null)}
                  style={inputStyle}
                >
                  <option value="">Selecciona una OC…</option>
                  {(pos ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.poNumber} — {p.supplier} ({p.currency || "USD"})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Modo">
                <select value={allocMode} onChange={(e) => setAllocMode(e.target.value as any)} style={inputStyle}>
                  <option value="percentage">Porcentaje (%)</option>
                  <option value="amount">Monto ({invoice.currency})</option>
                </select>
              </Field>
              <Field label={allocMode === "percentage" ? "% a asignar" : "Monto a asignar"}>
                <input
                  type="number"
                  step="0.01"
                  value={allocValue}
                  onChange={(e) => setAllocValue(e.target.value)}
                  style={inputStyle}
                  placeholder={allocMode === "percentage" ? "ej. 100" : "ej. 250.00"}
                />
              </Field>
              <Field label="Tipo de cambio (si aplica)">
                <input
                  type="number"
                  step="0.0001"
                  value={allocRate}
                  onChange={(e) => setAllocRate(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Notas" style={{ gridColumn: "span 2" }}>
                <input
                  value={allocNotes}
                  onChange={(e) => setAllocNotes(e.target.value)}
                  style={inputStyle}
                  placeholder="opcional"
                />
              </Field>
              <div style={{ gridColumn: "span 2", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowAllocForm(false)} style={btnSecondary} disabled={busy}>
                  Cancelar
                </button>
                <button onClick={doAllocate} disabled={busy} style={btnPrimary}>
                  {busy ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Link2 size={14} />}
                  Asignar
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: "0.75rem" }}>
            {allocs.length === 0 ? (
              <div style={{ padding: "0.75rem", background: SOFT, borderRadius: 8, fontSize: "0.8125rem", color: MUTED, textAlign: "center" }}>
                Sin asignaciones todavía.
              </div>
            ) : (
              <table style={miniTable}>
                <thead>
                  <tr>
                    <Th>OC</Th>
                    <Th style={{ textAlign: "right" }}>%</Th>
                    <Th style={{ textAlign: "right" }}>Monto</Th>
                    <Th>Conversión</Th>
                    <Th style={{ width: 40 }}></Th>
                  </tr>
                </thead>
                <tbody>
                  {allocs.map((a) => (
                    <tr key={a.id}>
                      <Td style={{ fontWeight: 700, color: CYAN }}>{a.poNumber}</Td>
                      <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{a.percentage.toFixed(1)}%</Td>
                      <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {a.allocatedAmount.toFixed(2)} {a.sourceCurrency}
                      </Td>
                      <Td style={{ color: MUTED, fontSize: "0.75rem" }}>
                        {a.sourceCurrency !== a.targetCurrency && a.convertedAmount != null
                          ? `→ ${a.convertedAmount.toFixed(2)} ${a.targetCurrency} @${a.exchangeRate}`
                          : "—"}
                      </Td>
                      <Td style={{ textAlign: "center" }}>
                        <button
                          onClick={() => doDeallocate(a.id)}
                          disabled={busy}
                          style={iconBtnDanger}
                          aria-label="Quitar asignación"
                        >
                          <Trash2 size={14} />
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div
          style={{
            padding: "0.75rem 1.25rem",
            borderTop: `1px solid ${BORDER}`,
            display: "flex",
            gap: "0.5rem",
          }}
        >
          <div style={{ flex: 1 }} />
          <button onClick={doDelete} disabled={busy} style={btnDanger}>
            <Trash2 size={14} /> Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function NewInvoiceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [costType, setCostType] = useState<string>("freight");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [totalAmount, setTotalAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!invoiceNumber.trim()) return toast.error("Número de factura requerido");
    if (!supplier.trim()) return toast.error("Proveedor requerido");
    const total = parseFloat(totalAmount);
    if (!isFinite(total) || total <= 0) return toast.error("Monto total inválido");

    setSaving(true);
    try {
      const inv = await createCostInvoice({
        invoiceNumber: invoiceNumber.trim(),
        supplier: supplier.trim(),
        costType,
        date,
        totalAmount: total,
        currency,
        notes: notes.trim() || null,
      });
      if (inv) {
        toast.success(`Factura ${inv.invoiceNumber} creada`);
        await onCreated();
      } else {
        toast.error("No se pudo crear la factura");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error creando factura");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={drawerOverlay} onClick={onClose}>
      <div style={{ ...drawerPanel, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem 1.25rem",
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <h2 style={{ fontSize: "1.125rem", fontWeight: 800, color: INK, margin: 0 }}>
            Nueva Factura de Costo
          </h2>
          <button onClick={onClose} style={iconBtn} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "1rem 1.25rem", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <Field label="Número de factura">
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Fecha">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Proveedor" style={{ gridColumn: "span 2" }}>
              <input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={inputStyle} placeholder="p.ej. DHL, Aduana" />
            </Field>
            <Field label="Tipo de costo">
              <select value={costType} onChange={(e) => setCostType(e.target.value)} style={inputStyle}>
                {COST_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Moneda">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GTQ">GTQ</option>
              </select>
            </Field>
            <Field label="Monto total" style={{ gridColumn: "span 2" }}>
              <input
                type="number"
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Notas" style={{ gridColumn: "span 2" }}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              />
            </Field>
          </div>

          <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: MUTED }}>
            Una vez creada, asigna esta factura a una o más OC. La extracción automática por PDF vendrá en la siguiente fase.
          </p>
        </div>

        <div
          style={{
            padding: "0.75rem 1.25rem",
            borderTop: `1px solid ${BORDER}`,
            display: "flex",
            gap: "0.5rem",
            justifyContent: "flex-end",
          }}
        >
          <button onClick={onClose} disabled={saving} style={btnSecondary}>
            Cancelar
          </button>
          <button onClick={submit} disabled={saving} style={{ ...btnPrimary, background: ORANGE, borderColor: ORANGE }}>
            {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={14} />}
            Crear factura
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Shared atoms (duplicated from PurchaseOrders — keep them isolated per page so
// styling tweaks on one don't leak to the other.)
// ───────────────────────────────────────────────────────────────────────────

function KV({ label, value, emphasize = false }: { label: string; value: React.ReactNode; emphasize?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "0.6875rem", color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: emphasize ? "1rem" : "0.875rem", fontWeight: emphasize ? 800 : 500, color: emphasize ? ORANGE : INK }}>
        {value}
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

function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "0.625rem 0.75rem",
        fontSize: "0.6875rem",
        fontWeight: 700,
        color: MUTED,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        borderBottom: `1px solid ${BORDER}`,
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "0.625rem 0.75rem", color: INK, ...style }}>{children}</td>;
}

const btnBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "0.5rem 0.75rem",
  fontSize: "0.8125rem",
  fontWeight: 600,
  cursor: "pointer",
  background: "white",
  color: INK,
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: CYAN,
  color: "white",
  borderColor: CYAN,
};

const btnSecondary: React.CSSProperties = { ...btnBase };

const btnDanger: React.CSSProperties = {
  ...btnBase,
  background: "oklch(0.96 0.04 25)",
  color: "oklch(0.4 0.2 25)",
  borderColor: "oklch(0.88 0.08 25)",
};

const iconBtn: React.CSSProperties = {
  ...btnBase,
  padding: "0.375rem",
  background: "transparent",
  border: "none",
  color: MUTED,
};

const iconBtnDanger: React.CSSProperties = {
  ...iconBtn,
  color: "oklch(0.5 0.2 25)",
};

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
  maxWidth: 780,
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 0 40px oklch(0.3 0 0 / 0.2)",
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "0.75rem 1rem",
  padding: "0.75rem",
  background: SOFT,
  borderRadius: 8,
};

const miniTable: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.8125rem",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  overflow: "hidden",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.4375rem 0.625rem",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  fontSize: "0.8125rem",
  background: "white",
  color: INK,
  boxSizing: "border-box",
};

const spinKeyframes = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
