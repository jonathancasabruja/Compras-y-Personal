import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Plus,
  Eye,
  RefreshCw,
  CheckCircle2,
  PackageCheck,
  Trash2,
  X,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Upload,
  FileText,
  Sparkles,
  FileUp,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import {
  listPurchaseOrders,
  getPurchaseOrder,
  nextPoNumber,
  createPurchaseOrder,
  deletePurchaseOrder,
  setPurchaseOrderStatus,
  approvePurchaseOrder,
  costInvoiceAllocationsForPo,
  recalcLandedCosts,
  listPoAttachments,
  uploadPoAttachment,
  deletePoAttachment,
  isStorageConfigured,
  extractPoFromPdf,
  isPoExtractorConfigured,
  linkInvoiceToPo,
  type PurchaseOrder,
  type PurchaseOrderFull,
  type PoStatus,
  type CreatePoInput,
  type PoAttachment,
} from "@/lib/supabase";
import { compressPdfClientSide, formatBytes } from "@/lib/pdfCompress";
import { InvoiceLibraryPicker } from "@/components/InvoiceLibraryPicker";
import type { SupplierInvoice, InvoiceCategory } from "@/lib/supabase";

// ───────────────────────────────────────────────────────────────────────────
// Órdenes de Compra — Phase 1d MVP.
//
// What this ships:
//   - List with status / search filters
//   - Read-only detail drawer with items + extras + landed-cost breakdown
//   - Simple "New PO" form (manual entry, no AI extraction)
//   - Status transitions: draft → ordered → received → approved (+ delete)
//   - "Recalcular costos aterrizados" action
//
// What's NOT here yet (by design — see purchasingDb.ts + todo.md):
//   - AI PDF invoice extraction (needs forge API env vars)
//   - Attachments (waiting on Phase 1e Manus storage proxy config)
//   - Full inline editor (use Delete + recreate for now)
//   - Inventory writes on "Recibir" — those still happen in brewery until
//     Phase 2. Setting status to "received" here is status-only.
//
// All data goes through trpc.purchaseOrders.* — same tables brewery reads.
// ───────────────────────────────────────────────────────────────────────────

const CYAN = "oklch(0.65 0.17 200)";
const INK = "oklch(0.15 0 0)";
const MUTED = "oklch(0.55 0 0)";
const BORDER = "oklch(0.9 0 0)";
const SOFT = "oklch(0.98 0 0)";

const STATUS_STYLE: Record<PoStatus, { bg: string; fg: string; label: string }> = {
  draft:    { bg: "oklch(0.94 0 0)",        fg: "oklch(0.35 0 0)",     label: "Borrador" },
  ordered:  { bg: "oklch(0.92 0.06 240)",   fg: "oklch(0.35 0.15 240)", label: "Ordenada" },
  received: { bg: "oklch(0.94 0.1 85)",     fg: "oklch(0.4 0.15 70)",   label: "Recibida" },
  approved: { bg: "oklch(0.93 0.1 150)",    fg: "oklch(0.35 0.15 150)", label: "Aprobada" },
};

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<PurchaseOrder[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<PoStatus | "all">("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await listPurchaseOrders();
      setPos(rows);
    } catch (e: any) {
      setErr(e?.message ?? "Error cargando OC");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    if (!pos) return [];
    const needle = q.trim().toLowerCase();
    return pos.filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (!needle) return true;
      return (
        p.poNumber.toLowerCase().includes(needle) ||
        p.supplier.toLowerCase().includes(needle) ||
        (p.supplierInvoiceNumber ?? "").toLowerCase().includes(needle)
      );
    });
  }, [pos, filterStatus, q]);

  const selectedPo = useMemo(
    () => (selectedId && pos ? pos.find((p) => p.id === selectedId) ?? null : null),
    [selectedId, pos],
  );

  return (
    <div style={{ padding: "2rem 1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
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
            <ClipboardList size={22} style={{ color: CYAN }} />
            Órdenes de Compra
          </h1>
          <p style={{ color: MUTED, fontSize: "0.875rem", margin: "0.25rem 0 0" }}>
            Crea, consulta y cierra OC. El recibo físico al inventario sigue
            corriendo por brewery.casabruja.com hasta Fase 2.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={refresh} style={btnSecondary} disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refrescar
          </button>
          <button onClick={() => setCreating(true)} style={btnPrimary}>
            <Plus size={14} /> Nueva OC
          </button>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "0.75rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {(["all", "draft", "ordered", "received", "approved"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            style={{
              ...chipStyle,
              background: filterStatus === s ? CYAN : "white",
              color: filterStatus === s ? "white" : INK,
              borderColor: filterStatus === s ? CYAN : BORDER,
            }}
          >
            {s === "all" ? "Todas" : STATUS_STYLE[s].label}
            {pos && s !== "all" && (
              <span style={{ marginLeft: 6, opacity: 0.8 }}>
                ({pos.filter((p) => p.status === s).length})
              </span>
            )}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por OC, proveedor, factura…"
          style={{
            flex: "1 1 220px",
            minWidth: 200,
            padding: "0.5rem 0.75rem",
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            fontSize: "0.875rem",
          }}
        />
      </div>

      {err && <Banner tone="error" msg={err} />}

      {/* Table */}
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          overflow: "hidden",
          background: "white",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead style={{ background: SOFT }}>
            <tr>
              <Th>OC</Th>
              <Th>Proveedor</Th>
              <Th>Factura</Th>
              <Th>Fecha</Th>
              <Th style={{ textAlign: "right" }}>Total aterrizado</Th>
              <Th>Estado</Th>
              <Th style={{ width: 1 }}></Th>
            </tr>
          </thead>
          <tbody>
            {loading && !pos && (
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
                  No hay OC que coincidan con el filtro.
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr
                key={p.id}
                style={{ borderTop: `1px solid ${BORDER}`, cursor: "pointer" }}
                onClick={() => setSelectedId(p.id)}
              >
                <Td style={{ fontWeight: 700, color: CYAN }}>{p.poNumber}</Td>
                <Td>{p.supplier}</Td>
                <Td style={{ color: MUTED }}>{p.supplierInvoiceNumber || "—"}</Td>
                <Td style={{ color: MUTED }}>{p.date}</Td>
                <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {p.totalLandedCost != null
                    ? fmtMoney(p.totalLandedCost, p.currency ?? "USD")
                    : "—"}
                </Td>
                <Td>
                  <StatusPill status={p.status} />
                </Td>
                <Td style={{ textAlign: "right" }}>
                  <Eye size={16} style={{ color: MUTED }} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: MUTED }}>
        Cambios al inventario al "Recibir" siguen ejecutándose en{" "}
        <a
          href="https://brewery.casabruja.com/purchase-orders"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: CYAN, textDecoration: "underline" }}
        >
          brewery.casabruja.com <ExternalLink size={10} style={{ display: "inline" }} />
        </a>{" "}
        hasta Fase 2 de la migración.
      </p>

      {/* Detail drawer */}
      {selectedPo && (
        <PoDetailDrawer
          poRow={selectedPo}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      )}

      {/* New PO dialog */}
      {creating && (
        <NewPoDialog
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
// Detail drawer (read-only + actions)
// ───────────────────────────────────────────────────────────────────────────

function PoDetailDrawer({
  poRow,
  onClose,
  onChanged,
}: {
  poRow: PurchaseOrder;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [full, setFull] = useState<PurchaseOrderFull | null>(null);
  const [allocs, setAllocs] = useState<Awaited<ReturnType<typeof costInvoiceAllocationsForPo>>>([]);
  const [attachments, setAttachments] = useState<PoAttachment[]>([]);
  const [storageOk, setStorageOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    try {
      const [f, a, att, cfg] = await Promise.all([
        getPurchaseOrder(poRow.id),
        costInvoiceAllocationsForPo(poRow.id),
        listPoAttachments(poRow.id),
        isStorageConfigured().catch(() => false),
      ]);
      setFull(f);
      setAllocs(a);
      setAttachments(att);
      setStorageOk(cfg);
    } catch (e: any) {
      toast.error(e?.message ?? "Error cargando OC");
    }
  };

  useEffect(() => {
    load();
    // Reload if the underlying row id changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poRow.id]);

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    // Reset so choosing the same file twice still triggers change
    e.target.value = "";
    // 20 MB cap on raw input — compression will shrink it to fit the 8 MB
    // post-upload budget. Anything bigger is probably a mistake.
    if (picked.size > 20 * 1024 * 1024) {
      toast.error("Archivo muy grande (máx 20 MB)");
      return;
    }
    setBusy("upload");
    try {
      let fileToUpload = picked;
      // Compress PDFs client-side to the lowest-resolution-that's-still-readable.
      if (picked.type === "application/pdf" || picked.name.toLowerCase().endsWith(".pdf")) {
        toast.loading("Comprimiendo PDF…", { id: "compress" });
        const result = await compressPdfClientSide(picked);
        toast.dismiss("compress");
        if (result.compressed) {
          toast.info(
            `PDF comprimido: ${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)}`,
            { duration: 3500 },
          );
        }
        fileToUpload = result.file;
      }
      // Final sanity cap — Express JSON limit is 10 MB and base64 adds ~33%
      if (fileToUpload.size > 8 * 1024 * 1024) {
        toast.error(`Archivo sigue muy grande después de comprimir (${formatBytes(fileToUpload.size)}). Máx 8 MB.`);
        return;
      }
      const { attachment, storageConfigured } = await uploadPoAttachment(poRow.id, fileToUpload);
      if (!storageConfigured) {
        toast.warning("Almacenamiento no configurado — se guardó el registro pero no el archivo");
      } else {
        toast.success(`Subido: ${fileToUpload.name}`);
      }
      setStorageOk(storageConfigured);
      if (attachment) {
        setAttachments((prev) => [...prev, attachment]);
      } else {
        // fall back to reloading the list
        const fresh = await listPoAttachments(poRow.id);
        setAttachments(fresh);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Error subiendo archivo");
    } finally {
      setBusy(null);
    }
  };

  const doDeleteAttachment = async (id: number) => {
    if (!confirm("¿Eliminar este adjunto?")) return;
    setBusy("delAttach");
    try {
      await deletePoAttachment(id);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      toast.success("Adjunto eliminado");
    } catch (err: any) {
      toast.error(err?.message ?? "Error eliminando");
    } finally {
      setBusy(null);
    }
  };

  const doStatus = async (status: PoStatus) => {
    setBusy(status);
    try {
      if (status === "received") {
        await setPurchaseOrderStatus(poRow.id, status, new Date().toISOString().split("T")[0]);
      } else if (status === "approved") {
        await approvePurchaseOrder(poRow.id);
      } else {
        await setPurchaseOrderStatus(poRow.id, status, null);
      }
      toast.success(`Estado → ${STATUS_STYLE[status].label}`);
      await load();
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Error cambiando estado");
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async () => {
    if (!confirm(`¿Eliminar OC ${poRow.poNumber}? Esta acción no se puede deshacer.`)) return;
    setBusy("delete");
    try {
      await deletePurchaseOrder(poRow.id);
      toast.success("OC eliminada");
      onClose();
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Error eliminando");
    } finally {
      setBusy(null);
    }
  };

  const doRecalc = async () => {
    setBusy("recalc");
    try {
      await recalcLandedCosts(poRow.id);
      toast.success("Costos aterrizados recalculados");
      await load();
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Error recalculando");
    } finally {
      setBusy(null);
    }
  };

  const po = full?.po ?? poRow;
  const items = full?.items ?? [];
  const extras = full?.extraCosts ?? [];

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
            <div style={{ fontSize: "0.75rem", color: MUTED }}>Orden de Compra</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: INK, margin: 0 }}>{po.poNumber}</h2>
              <StatusPill status={po.status} />
            </div>
          </div>
          <button onClick={onClose} style={iconBtn} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "1rem 1.25rem", overflowY: "auto", flex: 1 }}>
          {/* Summary */}
          <div style={summaryGrid}>
            <KV label="Proveedor" value={po.supplier} />
            <KV label="Factura proveedor" value={po.supplierInvoiceNumber || "—"} />
            <KV label="Fecha" value={po.date} />
            <KV label="Esperada" value={po.expectedDate || "—"} />
            <KV label="Recibida" value={po.receivedDate || "—"} />
            <KV label="Moneda" value={`${po.currency || "USD"}${po.exchangeRate && po.exchangeRate !== 1 ? ` @${po.exchangeRate}` : ""}`} />
            <KV label="Total base" value={po.totalCost != null ? fmtMoney(po.totalCost, po.currency ?? "USD") : "—"} />
            <KV
              label="Total aterrizado"
              value={po.totalLandedCost != null ? fmtMoney(po.totalLandedCost, po.currency ?? "USD") : "—"}
              emphasize
            />
          </div>

          {po.notes && (
            <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: SOFT, borderRadius: 8, fontSize: "0.8125rem" }}>
              <div style={{ fontWeight: 700, color: INK, marginBottom: 4 }}>Notas</div>
              <div style={{ color: MUTED, whiteSpace: "pre-wrap" }}>{po.notes}</div>
            </div>
          )}

          {/* Items */}
          <Section title={`Líneas (${items.length})`}>
            {items.length === 0 ? (
              <Empty>Sin ítems.</Empty>
            ) : (
              <table style={miniTable}>
                <thead>
                  <tr>
                    <Th>Código</Th>
                    <Th>Descripción</Th>
                    <Th style={{ textAlign: "right" }}>Cant.</Th>
                    <Th>U.</Th>
                    <Th style={{ textAlign: "right" }}>Costo u.</Th>
                    <Th style={{ textAlign: "right" }}>Aterrizado</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <Td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{i.productCode}</Td>
                      <Td>{i.productDescription || "—"}</Td>
                      <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{i.qty}</Td>
                      <Td>{i.unit || "—"}</Td>
                      <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {(i.baseCostPerUnit ?? 0).toFixed(4)}
                      </Td>
                      <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                        {(i.landedTotalCost ?? 0).toFixed(2)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Extra costs */}
          <Section title={`Costos extra (${extras.length})`}>
            {extras.length === 0 ? (
              <Empty>Sin costos extra asignados.</Empty>
            ) : (
              <table style={miniTable}>
                <thead>
                  <tr>
                    <Th>Tipo</Th>
                    <Th>Descripción</Th>
                    <Th>Método</Th>
                    <Th style={{ textAlign: "right" }}>Monto</Th>
                    <Th>Ref factura</Th>
                  </tr>
                </thead>
                <tbody>
                  {extras.map((ec) => (
                    <tr key={ec.id}>
                      <Td>{ec.costType}</Td>
                      <Td>{ec.description || "—"}</Td>
                      <Td style={{ color: MUTED }}>{ec.allocationMethod}</Td>
                      <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {ec.amount.toFixed(2)}
                      </Td>
                      <Td>{ec.costInvoiceRef || "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Attachments */}
          <div style={{ marginTop: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: "0.8125rem", fontWeight: 800, color: INK, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Adjuntos ({attachments.length})
            </h3>
            <>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={onFileChosen}
                accept="application/pdf,image/*"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy === "upload"}
                style={btnSecondary}
              >
                {busy === "upload" ? (
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Upload size={14} />
                )}
                Subir archivo
              </button>
            </>
          </div>
          {storageOk === false && (
            <div style={{ marginTop: "0.5rem", padding: "0.5rem 0.75rem", background: "oklch(0.95 0.08 85)", border: `1px solid oklch(0.88 0.08 85)`, borderRadius: 8, fontSize: "0.75rem", color: "oklch(0.35 0.15 70)" }}>
              <AlertTriangle size={12} style={{ display: "inline", marginRight: 4 }} />
              Almacenamiento (BUILT_IN_FORGE_API_*) no configurado en Railway. Los metadatos del archivo se guardan en DB pero no hay copia del archivo en la nube.
            </div>
          )}
          <div style={{ marginTop: "0.5rem" }}>
            {attachments.length === 0 ? (
              <Empty>Sin adjuntos.</Empty>
            ) : (
              <table style={miniTable}>
                <thead>
                  <tr>
                    <Th>Archivo</Th>
                    <Th>Tipo</Th>
                    <Th>Subido</Th>
                    <Th style={{ width: 60 }}></Th>
                  </tr>
                </thead>
                <tbody>
                  {attachments.map((a) => (
                    <tr key={a.id}>
                      <Td style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <FileText size={14} style={{ color: MUTED }} />
                        {a.fileUrl ? (
                          <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: CYAN, textDecoration: "underline" }}>
                            {a.fileName || "archivo"}
                          </a>
                        ) : (
                          <span style={{ color: INK }}>{a.fileName || "archivo"}</span>
                        )}
                        {!a.fileUrl && (
                          <span style={{ fontSize: "0.65rem", color: MUTED, fontStyle: "italic" }}>(sin URL)</span>
                        )}
                      </Td>
                      <Td style={{ color: MUTED }}>{a.documentType || "—"}</Td>
                      <Td style={{ color: MUTED, fontSize: "0.75rem" }}>
                        {new Date(a.uploadedAt).toLocaleDateString()}
                      </Td>
                      <Td style={{ textAlign: "right" }}>
                        <button
                          onClick={() => doDeleteAttachment(a.id)}
                          disabled={busy === "delAttach"}
                          style={iconBtnDanger}
                          aria-label="Eliminar adjunto"
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

          {/* Cost invoice allocations */}
          <Section title={`Asignaciones de Fletes y Gastos (${allocs.length})`}>
            {allocs.length === 0 ? (
              <Empty>Sin facturas de costo asignadas a esta OC.</Empty>
            ) : (
              <table style={miniTable}>
                <thead>
                  <tr>
                    <Th>Factura</Th>
                    <Th>Proveedor</Th>
                    <Th>Tipo</Th>
                    <Th style={{ textAlign: "right" }}>%</Th>
                    <Th style={{ textAlign: "right" }}>Monto</Th>
                  </tr>
                </thead>
                <tbody>
                  {allocs.map((a) => (
                    <tr key={a.id}>
                      <Td style={{ fontWeight: 600 }}>{a.invoiceNumber}</Td>
                      <Td>{a.supplier}</Td>
                      <Td style={{ color: MUTED }}>{a.costType}</Td>
                      <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {a.percentage.toFixed(1)}%
                      </Td>
                      <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {a.allocatedAmount.toFixed(2)} {a.sourceCurrency}
                        {a.convertedAmount != null && a.sourceCurrency !== a.targetCurrency && (
                          <span style={{ color: MUTED, fontSize: "0.7rem" }}>
                            {" "}→ {a.convertedAmount.toFixed(2)} {a.targetCurrency}
                          </span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>

        {/* Actions footer */}
        <div
          style={{
            padding: "0.75rem 1.25rem",
            borderTop: `1px solid ${BORDER}`,
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          {po.status === "draft" && (
            <button onClick={() => doStatus("ordered")} disabled={!!busy} style={btnSecondary}>
              Marcar como ordenada
            </button>
          )}
          {po.status === "ordered" && (
            <button onClick={() => doStatus("received")} disabled={!!busy} style={btnSecondary}>
              <PackageCheck size={14} />
              Marcar como recibida
            </button>
          )}
          {(po.status === "received" || po.status === "ordered") && (
            <button onClick={() => doStatus("approved")} disabled={!!busy} style={btnPrimary}>
              <CheckCircle2 size={14} />
              Aprobar
            </button>
          )}
          <button onClick={doRecalc} disabled={!!busy} style={btnSecondary}>
            <RefreshCw size={14} />
            Recalcular costos
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={doDelete} disabled={!!busy} style={btnDanger}>
            <Trash2 size={14} />
            Eliminar
          </button>
        </div>

        {po.status === "received" && (
          <div
            style={{
              padding: "0.5rem 1.25rem",
              background: "oklch(0.95 0.08 85)",
              borderTop: `1px solid ${BORDER}`,
              color: "oklch(0.35 0.15 70)",
              fontSize: "0.75rem",
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            <AlertTriangle size={14} />
            Este estado es sólo un marcador en Compras. El ingreso físico al
            inventario debe confirmarse desde brewery.casabruja.com hasta que
            termine la migración (Fase 2).
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// New PO dialog — minimal manual entry form
// ───────────────────────────────────────────────────────────────────────────

type DraftItem = {
  productCode: string;
  productDescription: string;
  qty: string;
  unit: string;
  baseCostPerUnit: string;
};

function NewPoDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  // If the user opened this dialog by picking an invoice from the library,
  // we keep its id so we can back-link the resulting PO once it's created.
  const [sourceInvoiceId, setSourceInvoiceId] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [suggestedNumber, setSuggestedNumber] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([
    { productCode: "", productDescription: "", qty: "", unit: "kg", baseCostPerUnit: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractorOk, setExtractorOk] = useState<boolean | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nextPoNumber()
      .then((n) => {
        setSuggestedNumber(n);
        setPoNumber(n);
      })
      .catch(() => void 0);
    isPoExtractorConfigured()
      .then(setExtractorOk)
      .catch(() => setExtractorOk(false));
  }, []);

  // Apply a library invoice's extracted data to this dialog's form fields.
  // Leaves existing values alone if the user already typed something —
  // libraries are hints, not overrides.
  const applyFromInvoice = (inv: SupplierInvoice) => {
    setSourceInvoiceId(inv.id);
    const ex = inv.extractedData;
    if (inv.supplier && !supplier.trim()) setSupplier(inv.supplier);
    if (inv.invoiceNumber && !supplierInvoiceNumber.trim()) setSupplierInvoiceNumber(inv.invoiceNumber);
    if (inv.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(inv.invoiceDate)) setDate(inv.invoiceDate);
    if (inv.currency) setCurrency(inv.currency);
    if (ex?.paymentTerms) {
      setNotes((prev) => (prev.trim() ? `${prev}\n${ex.paymentTerms}` : ex.paymentTerms || ""));
    }
    if (ex?.items && ex.items.length > 0) {
      const extractedItems: DraftItem[] = ex.items.map((it) => ({
        productCode: it.productCode || "",
        productDescription: it.productDescription || "",
        qty: String(it.qty ?? ""),
        unit: it.unit || "kg",
        baseCostPerUnit: String(it.unitPrice ?? ""),
      }));
      setItems(extractedItems);
    }
    if (ex?.extraCosts && ex.extraCosts.length > 0) {
      const ecText = ex.extraCosts
        .map((c) => `• ${c.costType}: ${c.description || ""} = ${c.amount.toFixed(2)}`)
        .join("\n");
      setNotes((prev) =>
        prev.trim() ? `${prev}\n\nCostos extra detectados:\n${ecText}` : `Costos extra detectados:\n${ecText}`,
      );
    }
    setShowPicker(false);
    toast.success(
      `Pre-rellenado desde ${inv.supplier ?? "factura"}: ${ex?.items?.length ?? 0} ítem(s), ${ex?.extraCosts?.length ?? 0} costo(s) extra`,
      { duration: 4000 },
    );
  };

  const onPdfChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so same file re-triggers change
    if (file.size > 8 * 1024 * 1024) {
      toast.error("PDF muy grande (máx 8 MB)");
      return;
    }
    setExtracting(true);
    try {
      const extracted = await extractPoFromPdf(file);
      // Pre-fill form fields (keep existing values the user may have typed)
      if (!supplier.trim()) setSupplier(extracted.supplier || "");
      if (!supplierInvoiceNumber.trim()) setSupplierInvoiceNumber(extracted.invoiceNumber || "");
      if (extracted.date && /^\d{4}-\d{2}-\d{2}$/.test(extracted.date)) setDate(extracted.date);
      if (extracted.currency) setCurrency(extracted.currency);
      if (extracted.paymentTerms) {
        setNotes((prev) =>
          prev.trim() ? `${prev}\n${extracted.paymentTerms}` : extracted.paymentTerms || "",
        );
      }
      // Overwrite items and append extra costs as additional items for review
      const extractedItems: DraftItem[] = extracted.items.map((it) => ({
        productCode: it.productCode || "",
        productDescription: it.productDescription || "",
        qty: String(it.qty ?? ""),
        unit: it.unit || "kg",
        baseCostPerUnit: String(it.unitPrice ?? ""),
      }));
      setItems(
        extractedItems.length > 0
          ? extractedItems
          : [{ productCode: "", productDescription: "", qty: "", unit: "kg", baseCostPerUnit: "" }],
      );

      const parts: string[] = [`${extracted.items.length} ítem(s) extraídos`];
      if (extracted.extraCosts.length > 0) {
        const totalExtras = extracted.extraCosts.reduce((s, c) => s + c.amount, 0);
        parts.push(
          `${extracted.extraCosts.length} costo(s) extra por $${totalExtras.toFixed(2)} — revisa y agrégalos manualmente en Costos Extra`,
        );
      }
      toast.success(parts.join(". "), { duration: 6000 });

      if (extracted.extraCosts.length > 0) {
        // Add the extras as a note block so they're not lost
        const ecText = extracted.extraCosts
          .map((c) => `• ${c.costType}: ${c.description || ""} = ${c.amount.toFixed(2)}`)
          .join("\n");
        setNotes((prev) =>
          prev.trim() ? `${prev}\n\nCostos extra detectados:\n${ecText}` : `Costos extra detectados:\n${ecText}`,
        );
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Error extrayendo PDF");
    } finally {
      setExtracting(false);
    }
  };

  const totalBase = useMemo(
    () =>
      items.reduce((s, i) => {
        const q = parseFloat(i.qty || "0");
        const c = parseFloat(i.baseCostPerUnit || "0");
        return s + (isFinite(q) && isFinite(c) ? q * c : 0);
      }, 0),
    [items],
  );

  const update = (idx: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const addRow = () =>
    setItems((prev) => [
      ...prev,
      { productCode: "", productDescription: "", qty: "", unit: "kg", baseCostPerUnit: "" },
    ]);

  const removeRow = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!poNumber.trim()) return toast.error("Número de OC requerido");
    if (!supplier.trim()) return toast.error("Proveedor requerido");
    const cleanItems = items
      .filter((i) => i.productCode.trim() && parseFloat(i.qty || "0") > 0)
      .map((i) => ({
        productCode: i.productCode.trim(),
        productDescription: i.productDescription.trim() || null,
        qty: parseFloat(i.qty),
        unit: i.unit.trim() || null,
        baseCostPerUnit: parseFloat(i.baseCostPerUnit || "0"),
      }));
    if (cleanItems.length === 0) return toast.error("Agrega al menos 1 ítem válido");

    setSaving(true);
    try {
      const input: CreatePoInput = {
        poNumber: poNumber.trim(),
        supplier: supplier.trim(),
        supplierInvoiceNumber: supplierInvoiceNumber.trim() || null,
        date,
        currency,
        exchangeRate: parseFloat(exchangeRate) || 1,
        notes: notes.trim() || null,
        items: cleanItems,
      };
      const po = await createPurchaseOrder(input);
      if (po) {
        // If the user picked from the invoice library, back-link so the
        // invoice shows "OC #N" chip and doesn't accidentally get used
        // again for another PO.
        if (sourceInvoiceId) {
          await linkInvoiceToPo(sourceInvoiceId, po.id).catch(() => undefined);
        }
        toast.success(`OC ${po.poNumber} creada`);
        await onCreated();
      } else {
        toast.error("No se pudo crear la OC");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error creando OC");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={drawerOverlay} onClick={onClose}>
      <div style={{ ...drawerPanel, maxWidth: 780 }} onClick={(e) => e.stopPropagation()}>
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
            Nueva Orden de Compra
          </h2>
          <button onClick={onClose} style={iconBtn} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "1rem 1.25rem", overflowY: "auto", flex: 1 }}>
          {/* Auto-fill banner: primary path = library picker, fallback = direct PDF upload */}
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.875rem 1rem",
              background: "linear-gradient(135deg, oklch(0.97 0.04 200) 0%, oklch(0.97 0.05 280) 100%)",
              border: `1px solid oklch(0.88 0.08 240)`,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <Sparkles size={20} style={{ color: "oklch(0.5 0.18 260)", flexShrink: 0 }} />
            <div style={{ flex: "1 1 220px", minWidth: 180 }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: INK }}>
                Auto-rellenar desde repositorio
              </div>
              <div style={{ fontSize: "0.75rem", color: MUTED, marginTop: 2 }}>
                {sourceInvoiceId ? (
                  <span style={{ color: "oklch(0.4 0.15 150)", fontWeight: 600 }}>
                    ✓ Pre-rellenado desde factura #{sourceInvoiceId}. Los campos arriba son editables.
                  </span>
                ) : (
                  <>Elige una factura ya subida al repositorio (clasificada por IA) y los campos se rellenan.</>
                )}
              </div>
            </div>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={onPdfChosen}
            />
            <button
              onClick={() => setShowPicker(true)}
              style={{
                ...btnPrimary,
                background: "oklch(0.55 0.18 260)",
                borderColor: "oklch(0.55 0.18 260)",
              }}
            >
              <FolderOpen size={14} />
              {sourceInvoiceId ? "Cambiar factura" : "Seleccionar factura"}
            </button>
            <button
              onClick={() => pdfInputRef.current?.click()}
              disabled={extracting || extractorOk === false}
              title={extractorOk === false ? "Configura OPENAI_API_KEY en Railway para habilitar" : "Subir un PDF directamente (sin guardar en el repositorio)"}
              style={{
                ...btnSecondary,
                opacity: extractorOk === false ? 0.5 : 1,
              }}
            >
              {extracting ? (
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <FileUp size={14} />
              )}
              {extracting ? "Analizando…" : "Subir PDF directo"}
            </button>
          </div>

          {showPicker && (
            <InvoiceLibraryPicker
              allowedCategories={["brewing_raw_materials", "brewing_packaging", "brewing_equipment"]}
              title="Elige una factura para esta OC"
              onClose={() => setShowPicker(false)}
              onPick={applyFromInvoice}
            />
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <Field label="Número OC">
              <input
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                style={inputStyle}
                placeholder={suggestedNumber}
              />
            </Field>
            <Field label="Fecha">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Proveedor">
              <input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                style={inputStyle}
                placeholder="p.ej. YCH Hops"
              />
            </Field>
            <Field label="Factura proveedor">
              <input
                value={supplierInvoiceNumber}
                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                style={inputStyle}
                placeholder="opcional"
              />
            </Field>
            <Field label="Moneda">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GTQ">GTQ</option>
              </select>
            </Field>
            <Field label="Tipo de cambio">
              <input
                type="number"
                step="0.0001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Notas" style={{ marginTop: "0.75rem" }}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
              placeholder="Condiciones de entrega, pago, etc."
            />
          </Field>

          <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: INK, margin: 0 }}>Ítems</h3>
            <button onClick={addRow} style={btnSecondary}>
              <Plus size={14} /> Agregar
            </button>
          </div>

          <div style={{ marginTop: "0.5rem", overflowX: "auto" }}>
            <table style={miniTable}>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Descripción</Th>
                  <Th style={{ width: 90 }}>Cant.</Th>
                  <Th style={{ width: 70 }}>U.</Th>
                  <Th style={{ width: 110 }}>Costo u.</Th>
                  <Th style={{ width: 30 }}></Th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <Td style={{ padding: 4 }}>
                      <input
                        value={it.productCode}
                        onChange={(e) => update(idx, { productCode: e.target.value })}
                        style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.75rem" }}
                        placeholder="HOPS-CITRA"
                      />
                    </Td>
                    <Td style={{ padding: 4 }}>
                      <input
                        value={it.productDescription}
                        onChange={(e) => update(idx, { productDescription: e.target.value })}
                        style={inputStyle}
                      />
                    </Td>
                    <Td style={{ padding: 4 }}>
                      <input
                        type="number"
                        step="0.01"
                        value={it.qty}
                        onChange={(e) => update(idx, { qty: e.target.value })}
                        style={{ ...inputStyle, textAlign: "right" }}
                      />
                    </Td>
                    <Td style={{ padding: 4 }}>
                      <input
                        value={it.unit}
                        onChange={(e) => update(idx, { unit: e.target.value })}
                        style={inputStyle}
                      />
                    </Td>
                    <Td style={{ padding: 4 }}>
                      <input
                        type="number"
                        step="0.0001"
                        value={it.baseCostPerUnit}
                        onChange={(e) => update(idx, { baseCostPerUnit: e.target.value })}
                        style={{ ...inputStyle, textAlign: "right" }}
                      />
                    </Td>
                    <Td style={{ padding: 4, textAlign: "center" }}>
                      {items.length > 1 && (
                        <button onClick={() => removeRow(idx)} style={iconBtnDanger} aria-label="Eliminar fila">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: "0.75rem", textAlign: "right", fontSize: "0.9375rem", color: INK }}>
            <span style={{ color: MUTED, marginRight: 8 }}>Total base:</span>
            <strong>{fmtMoney(totalBase, currency)}</strong>
          </div>

          <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: MUTED }}>
            Los costos de flete y aduana se asignan después en <strong>Fletes y Gastos</strong>.
            La carga de PDFs por IA y adjuntos vendrán en la siguiente fase.
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
          <button onClick={submit} disabled={saving} style={btnPrimary}>
            {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={14} />}
            Crear OC
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Shared bits
// ───────────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: PoStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: "0.6875rem",
        fontWeight: 700,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
      }}
    >
      {s.label}
    </span>
  );
}

function KV({ label, value, emphasize = false }: { label: string; value: React.ReactNode; emphasize?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "0.6875rem", color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: emphasize ? "1rem" : "0.875rem", fontWeight: emphasize ? 800 : 500, color: emphasize ? CYAN : INK }}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: "1.25rem" }}>
      <h3 style={{ fontSize: "0.8125rem", fontWeight: 800, color: INK, margin: "0 0 0.375rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "0.75rem", background: SOFT, borderRadius: 8, fontSize: "0.8125rem", color: MUTED, textAlign: "center" }}>
      {children}
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

function Banner({ tone, msg }: { tone: "error" | "info"; msg: string }) {
  const bg = tone === "error" ? "oklch(0.95 0.08 25)" : "oklch(0.95 0.04 240)";
  const fg = tone === "error" ? "oklch(0.4 0.15 25)" : "oklch(0.4 0.15 240)";
  return (
    <div
      style={{
        background: bg,
        color: fg,
        padding: "0.625rem 0.875rem",
        borderRadius: 8,
        fontSize: "0.8125rem",
        marginBottom: "0.75rem",
      }}
    >
      {msg}
    </div>
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

function fmtMoney(v: number, ccy: string) {
  return `${ccy} ${v.toFixed(2)}`;
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
  transition: "background 0.1s",
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

const chipStyle: React.CSSProperties = {
  ...btnBase,
  padding: "0.375rem 0.75rem",
  fontSize: "0.75rem",
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
  maxWidth: 900,
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
