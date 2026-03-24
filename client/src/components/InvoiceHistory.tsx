/**
 * InvoiceHistory — Shows lotes (batches) and their invoices.
 * Click a lote to expand and see all invoices within it.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronDown, ChevronRight, Eye, FileText, Printer, FileSpreadsheet } from 'lucide-react';
import {
  type Lote,
  type Factura,
  type InvoiceDraft,
  type DeptLineItem,
  obtenerLotes,
  obtenerFacturasPorLote,
} from '@/lib/supabase';

interface Props {
  onViewInvoice: (draft: InvoiceDraft) => void;
  onPrintBatch: (drafts: InvoiceDraft[]) => void;
  onDownloadCSV?: (drafts: InvoiceDraft[], filename?: string) => void;
  refreshKey?: number;
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function facturaToDraft(f: Factura): InvoiceDraft {
  const persona = f.persona || {
    nombre_completo: 'Desconocido',
    cedula: '',
    dv: '',
    cuenta_bancaria: '',
    nombre_banco: '',
    tipo_cuenta: '',
    titular_cuenta: '',
  };

  const departamentos: DeptLineItem[] =
    f.detalle_departamentos && Array.isArray(f.detalle_departamentos)
      ? f.detalle_departamentos
      : [
          {
            departamento: f.departamento || 'GENERAL',
            clave: '',
            dias: f.dias_trabajados || 1,
            tarifa_diaria: f.tarifa_diaria || f.saldo_adeudado,
            horas_extra: f.horas_extra || 0,
            tarifa_hora_extra: 5,
            subtotal: f.saldo_adeudado,
          },
        ];

  return {
    persona,
    departamentos,
    empresa: f.empresa,
    fecha: f.fecha,
    numero_factura: f.numero_factura,
    saldo_adeudado: f.saldo_adeudado,
  };
}

export default function InvoiceHistory({ onViewInvoice, onPrintBatch, onDownloadCSV, refreshKey }: Props) {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLote, setExpandedLote] = useState<number | null>(null);
  const [loteFacturas, setLoteFacturas] = useState<Record<number, Factura[]>>({});
  const [loadingLote, setLoadingLote] = useState<number | null>(null);

  useEffect(() => {
    loadLotes();
  }, [refreshKey]);

  async function loadLotes() {
    setLoading(true);
    try {
      const data = await obtenerLotes();
      setLotes(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function toggleLote(loteId: number) {
    if (expandedLote === loteId) {
      setExpandedLote(null);
      return;
    }
    setExpandedLote(loteId);
    if (!loteFacturas[loteId]) {
      setLoadingLote(loteId);
      try {
        const facturas = await obtenerFacturasPorLote(loteId);
        setLoteFacturas((prev) => ({ ...prev, [loteId]: facturas }));
      } catch {
        // silent
      } finally {
        setLoadingLote(null);
      }
    }
  }

  function handlePrintLote(loteId: number) {
    const facturas = loteFacturas[loteId];
    if (!facturas) return;
    const drafts = facturas.map(facturaToDraft);
    onPrintBatch(drafts);
  }

  function handleDownloadCSVLote(loteId: number, loteNombre: string) {
    const facturas = loteFacturas[loteId];
    if (!facturas || !onDownloadCSV) return;
    const drafts = facturas.map(facturaToDraft);
    onDownloadCSV(drafts, `ACH_${loteNombre.replace(/\s+/g, '_')}.txt`);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#1B4965' }} />
      </div>
    );
  }

  if (lotes.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: '#d1d5db' }} />
        <p className="text-sm" style={{ color: '#9ca3af' }}>
          No hay lotes de facturas guardados
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {lotes.map((lote) => {
        const isExpanded = expandedLote === lote.id;
        const facturas = lote.id ? loteFacturas[lote.id] : undefined;
        const isLoadingThis = loadingLote === lote.id;

        return (
          <div
            key={lote.id}
            className="border rounded-lg overflow-hidden"
            style={{ borderColor: '#e5e7eb' }}
          >
            {/* Lote header */}
            <button
              onClick={() => lote.id && toggleLote(lote.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              style={{ backgroundColor: isExpanded ? '#f9fafb' : '#ffffff' }}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" style={{ color: '#6b7280' }} />
                ) : (
                  <ChevronRight className="w-4 h-4" style={{ color: '#6b7280' }} />
                )}
                <div className="text-left">
                  <div className="font-semibold text-sm" style={{ color: '#111827' }}>
                    {lote.nombre}
                  </div>
                  <div className="text-xs" style={{ color: '#9ca3af' }}>
                    {lote.fecha} · {lote.total_facturas} factura
                    {lote.total_facturas !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div
                  className="font-bold text-sm"
                  style={{ color: '#1B4965', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  ${fmt(lote.monto_total)}
                </div>
              </div>
            </button>

            {/* Expanded: show invoices */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid #e5e7eb' }}>
                {isLoadingThis ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#1B4965' }} />
                  </div>
                ) : facturas && facturas.length > 0 ? (
                  <>
                    <div className="divide-y" style={{ borderColor: '#f3f4f6' }}>
                      {facturas.map((f) => {
                        const deptNames = f.detalle_departamentos
                          ? (f.detalle_departamentos as DeptLineItem[])
                              .map((d) => d.departamento)
                              .join(', ')
                          : f.departamento || '';
                        return (
                          <div
                            key={f.id}
                            className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className="text-xs font-mono px-2 py-0.5 rounded"
                                style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}
                              >
                                #{f.numero_factura}
                              </span>
                              <div>
                                <div className="text-sm font-medium" style={{ color: '#374151' }}>
                                  {f.persona?.nombre_completo || 'Sin nombre'}
                                </div>
                                <div className="text-xs" style={{ color: '#9ca3af' }}>
                                  {deptNames} · {f.empresa}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span
                                className="text-sm font-semibold"
                                style={{
                                  color: '#1B4965',
                                  fontFamily: "'JetBrains Mono', monospace",
                                }}
                              >
                                ${fmt(f.saldo_adeudado)}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => onViewInvoice(facturaToDraft(f))}
                              >
                                <Eye className="w-3.5 h-3.5" style={{ color: '#6b7280' }} />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div
                      className="px-4 py-2 flex justify-end gap-2"
                      style={{ backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb' }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => lote.id && handlePrintLote(lote.id)}
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Imprimir Lote
                      </Button>
                      {onDownloadCSV && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          style={{ color: '#16a34a', borderColor: '#bbf7d0' }}
                          onClick={() => lote.id && handleDownloadCSVLote(lote.id, lote.nombre)}
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          TXT ACH
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4 text-xs" style={{ color: '#9ca3af' }}>
                    Sin facturas
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
