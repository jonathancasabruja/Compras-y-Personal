/**
 * Home Page — Invoice Generation System
 * ======================================
 * Tabs:
 *  1. Crear Lote — Manual batch creation (search/add persons one by one)
 *  2. Pagos Eventuales — Auto-loads active eventuales for batch payment
 *  3. Eventuales — Manage active/inactive eventuales
 *  4. Historial — View saved batches and invoices
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PersonSearch from '@/components/PersonSearch';
import PersonForm from '@/components/PersonForm';
import InvoiceForm, { type InvoiceFormData } from '@/components/InvoiceForm';
import InvoicePreview from '@/components/InvoicePreview';
import InvoiceHistory from '@/components/InvoiceHistory';
import TarifasConfig from '@/components/TarifasConfig';
import ColaboradoresManager from '@/components/ColaboradoresManager';
import PagosColaboradores from '@/components/PagosColaboradores';
import {
  obtenerTarifas,
  crearLote,
  guardarFacturasBatch,
  generarTXTBancario,
  descargarTXT,
  generarExcelLote,
  type Persona,
  type InvoiceDraft,
  type TarifaDepartamento,
} from '@/lib/supabase';
import {
  FileText,
  Printer,
  Download,
  Save,
  Plus,
  History,
  Loader2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Package,
  FileSpreadsheet,
  Users,
  CreditCard,
} from 'lucide-react';
import { toast } from 'sonner';

/** A single entry in the batch: one person + their invoice data */
interface BatchEntry {
  persona: Persona;
  formData: InvoiceFormData;
}

type ViewMode = 'create' | 'preview' | 'history-view';

export default function Home() {
  // ─── Global state ──────────────────────────────────
  const [tarifas, setTarifas] = useState<TarifaDepartamento[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('create');
  const [activeTab, setActiveTab] = useState('create');
  const [refreshKey, setRefreshKey] = useState(0);
  const [colabRefreshKey, setColabRefreshKey] = useState(0);

  // ─── Batch creation state ──────────────────────────
  const [batchEntries, setBatchEntries] = useState<BatchEntry[]>([]);
  const [batchName, setBatchName] = useState('');
  const [currentEditIndex, setCurrentEditIndex] = useState(-1);

  // Current person being added
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [showNewPersonForm, setShowNewPersonForm] = useState(false);
  const [currentFormData, setCurrentFormData] = useState<InvoiceFormData>(emptyFormData());

  // ─── Preview state ─────────────────────────────────
  const [previewDrafts, setPreviewDrafts] = useState<InvoiceDraft[]>([]);
  const [previewBatchName, setPreviewBatchName] = useState('');
  const [currentPreviewIdx, setCurrentPreviewIdx] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // ─── History view state ────────────────────────────
  const [viewingDraft, setViewingDraft] = useState<InvoiceDraft | null>(null);

  // ─── Shared date/empresa for the manual batch ──────
  const [sharedFecha, setSharedFecha] = useState(new Date().toISOString().split('T')[0]);
  const [sharedEmpresa, setSharedEmpresa] = useState('');

  // ─── Init: load tarifas ────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const t = await obtenerTarifas();
        setTarifas(t);
      } catch (err) {
        console.error(err);
        toast.error('Error al conectar con la base de datos');
      } finally {
        setLoadingInit(false);
      }
    })();
  }, []);

  function emptyFormData(): InvoiceFormData {
    return {
      fecha: new Date().toISOString().split('T')[0],
      empresa: '',
      departamentos: [],
      totalCalculado: 0,
      numeroFactura: 0,
    };
  }

  // ─── Person handlers ───────────────────────────────
  const handlePersonSelected = (persona: Persona) => {
    setSelectedPersona(persona);
    setShowNewPersonForm(false);
    setCurrentFormData(emptyFormData());
  };

  const handlePersonCreated = (persona: Persona) => {
    setSelectedPersona(persona);
    setShowNewPersonForm(false);
    setCurrentFormData(emptyFormData());
  };

  const handleClearPerson = () => {
    setSelectedPersona(null);
    setShowNewPersonForm(false);
    setCurrentFormData(emptyFormData());
  };

  // ─── Add person to batch ───────────────────────────
  const handleAddToBatch = () => {
    if (!selectedPersona) {
      toast.error('Seleccione una persona');
      return;
    }
    if (currentFormData.departamentos.length === 0) {
      toast.error('Seleccione al menos un departamento');
      return;
    }
    if (currentFormData.departamentos.some((d) => d.dias <= 0)) {
      toast.error('Ingrese los días trabajados para cada departamento');
      return;
    }
    if (!currentFormData.numeroFactura || currentFormData.numeroFactura <= 0) {
      toast.error('Ingrese un número de factura válido');
      return;
    }

    const alreadyExists = batchEntries.some(
      (e, idx) => e.persona.id === selectedPersona.id && idx !== currentEditIndex
    );
    if (alreadyExists) {
      toast.error('Esta persona ya está en el lote');
      return;
    }

    // Invoice numbers are per-person, duplicates in the same batch are allowed

    const entry: BatchEntry = {
      persona: selectedPersona,
      formData: { ...currentFormData, fecha: sharedFecha, empresa: sharedEmpresa },
    };

    if (currentEditIndex >= 0) {
      setBatchEntries((prev) => prev.map((e, i) => (i === currentEditIndex ? entry : e)));
      setCurrentEditIndex(-1);
    } else {
      setBatchEntries((prev) => [...prev, entry]);
    }

    setSelectedPersona(null);
    setShowNewPersonForm(false);
    setCurrentFormData(emptyFormData());
    toast.success(`${entry.persona.nombre_completo} agregado al lote`);
  };

  const handleRemoveFromBatch = (idx: number) => {
    setBatchEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleEditBatchEntry = (idx: number) => {
    const entry = batchEntries[idx];
    setSelectedPersona(entry.persona);
    setCurrentFormData(entry.formData);
    setCurrentEditIndex(idx);
  };

  // ─── Generate all invoices (preview) — manual batch ─
  const handleGenerateAll = () => {
    if (batchEntries.length === 0) {
      toast.error('Agregue al menos una persona al lote');
      return;
    }
    if (!sharedEmpresa) {
      toast.error('Seleccione la empresa a cobrar');
      return;
    }
    if (!batchName.trim()) {
      toast.error('Ingrese un nombre para el lote');
      return;
    }

    const drafts: InvoiceDraft[] = batchEntries.map((entry) => ({
      persona: entry.persona,
      departamentos: entry.formData.departamentos,
      empresa: sharedEmpresa,
      fecha: sharedFecha,
      numero_factura: entry.formData.numeroFactura,
      saldo_adeudado: entry.formData.totalCalculado,
    }));

    setPreviewDrafts(drafts);
    setPreviewBatchName(batchName);
    setCurrentPreviewIdx(0);
    setIsSaved(false);
    setViewMode('preview');
  };

  // ─── Generate invoices from PagosColaboradores ─────
  const handlePagosGenerate = (drafts: InvoiceDraft[], pagoBatchName: string, empresa: string) => {
    setPreviewDrafts(drafts);
    setPreviewBatchName(pagoBatchName);
    setSharedEmpresa(empresa);
    setSharedFecha(drafts[0]?.fecha || new Date().toISOString().split('T')[0]);
    setCurrentPreviewIdx(0);
    setIsSaved(false);
    setViewMode('preview');
  };

  // ─── Save all to Supabase ──────────────────────────
  const handleSaveAll = async () => {
    if (previewDrafts.length === 0) return;
    setIsSaving(true);
    try {
      const totalMonto = previewDrafts.reduce((s, d) => s + d.saldo_adeudado, 0);
      const lote = await crearLote({
        nombre: previewBatchName.trim(),
        fecha: previewDrafts[0]?.fecha || sharedFecha,
        total_facturas: previewDrafts.length,
        monto_total: totalMonto,
      });

      const facturas = previewDrafts.map((draft) => {
        const totalDias = draft.departamentos.reduce((s, d) => s + d.dias, 0);
        const totalHorasExtra = draft.departamentos.reduce((s, d) => s + d.horas_extra, 0);
        const deptNames = draft.departamentos.map((d) => d.departamento).join(', ');
        const avgTarifa = draft.departamentos.length > 0
          ? draft.departamentos.reduce((s, d) => s + d.tarifa_diaria, 0) / draft.departamentos.length
          : 0;
        const montoHorasExtra = draft.departamentos.reduce(
          (s, d) => s + d.horas_extra * d.tarifa_hora_extra, 0
        );

        return {
          numero_factura: draft.numero_factura,
          fecha: draft.fecha,
          empresa: draft.empresa,
          saldo_adeudado: draft.saldo_adeudado,
          persona_id: draft.persona.id!,
          departamento: deptNames,
          dias_trabajados: totalDias,
          tarifa_diaria: avgTarifa,
          horas_extra: totalHorasExtra,
          monto_horas_extra: montoHorasExtra,
          detalle_departamentos: draft.departamentos,
          lote_id: lote.id!,
        };
      });

      const result = await guardarFacturasBatch(facturas);
      
      if (result.duplicados.length > 0) {
        const nums = result.duplicados.join(', ');
        toast.warning(
          `Lote guardado. Nota: las facturas #${nums} ya existían y fueron omitidas.`,
          { duration: 6000 }
        );
      } else {
        toast.success(`Lote "${previewBatchName}" guardado con ${previewDrafts.length} factura(s)`);
      }
      setIsSaved(true);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      toast.error('Error al guardar: ' + (err?.message || 'Error desconocido'));
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Print / PDF ───────────────────────────────────
  function renderSummaryPage(drafts: InvoiceDraft[], batchName: string): string {
    const totalMonto = drafts.reduce((s, d) => s + d.saldo_adeudado, 0);
    const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fecha = drafts[0]?.fecha || '';
    const parts = fecha.split('-');
    const fechaFmt = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : fecha;
    const empresa = drafts[0]?.empresa || '';

    const rowsHtml = drafts.map((d, idx) => {
      const deptNames = d.departamentos.map((dep) => dep.departamento).join(', ');
      return `<tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:8px 12px;font-size:12px;color:#444;text-align:center;font-family:'JetBrains Mono',monospace;">${idx + 1}</td>
        <td style="padding:8px 12px;font-size:12px;color:#222;font-weight:500;">${d.persona.nombre_completo}</td>
        <td style="padding:8px 12px;font-size:12px;color:#444;text-align:center;font-family:'JetBrains Mono',monospace;">#${d.numero_factura}</td>
        <td style="padding:8px 12px;font-size:11px;color:#666;">${deptNames}</td>
        <td style="padding:8px 12px;text-align:right;font-size:12px;color:#222;font-weight:600;font-family:'JetBrains Mono',monospace;">USD ${fmt(d.saldo_adeudado)}</td>
      </tr>`;
    }).join('');

    return `<div style="font-family:'DM Sans',system-ui,sans-serif;padding:36px 40px;height:297mm;box-sizing:border-box;background:#fff;color:#1a1a1a;width:210mm;margin:0 auto;display:flex;flex-direction:column;page-break-after:always;">
      <div style="text-align:center;margin-bottom:36px;">
        <h1 style="font-size:28px;font-weight:300;letter-spacing:0.12em;color:#aaa;margin:0 0 8px 0;">RESUMEN DE LOTE</h1>
        <h2 style="font-size:18px;font-weight:700;color:#111;margin:0;">${batchName}</h2>
      </div>

      <div style="display:flex;justify-content:space-between;margin-bottom:28px;padding:16px 20px;background:#f9fafb;border-radius:8px;">
        <div>
          <p style="font-size:11px;color:#888;margin:0 0 4px 0;">Empresa</p>
          <p style="font-size:14px;font-weight:700;color:#111;margin:0;">${empresa}</p>
        </div>
        <div style="text-align:center;">
          <p style="font-size:11px;color:#888;margin:0 0 4px 0;">Fecha</p>
          <p style="font-size:14px;font-weight:600;color:#333;margin:0;font-family:'JetBrains Mono',monospace;">${fechaFmt}</p>
        </div>
        <div style="text-align:center;">
          <p style="font-size:11px;color:#888;margin:0 0 4px 0;">Transacciones</p>
          <p style="font-size:22px;font-weight:700;color:#1B4965;margin:0;font-family:'JetBrains Mono',monospace;">${drafts.length}</p>
        </div>
        <div style="text-align:right;">
          <p style="font-size:11px;color:#888;margin:0 0 4px 0;">Monto Total</p>
          <p style="font-size:22px;font-weight:700;color:#1B4965;margin:0;font-family:'JetBrains Mono',monospace;">USD ${fmt(totalMonto)}</p>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#333;">
          <th style="text-align:center;font-size:11px;font-weight:600;color:#fff;padding:8px 12px;width:6%;">No.</th>
          <th style="text-align:left;font-size:11px;font-weight:600;color:#fff;padding:8px 12px;width:30%;">Nombre</th>
          <th style="text-align:center;font-size:11px;font-weight:600;color:#fff;padding:8px 12px;width:12%;">Factura</th>
          <th style="text-align:left;font-size:11px;font-weight:600;color:#fff;padding:8px 12px;width:30%;">Departamento</th>
          <th style="text-align:right;font-size:11px;font-weight:600;color:#fff;padding:8px 12px;width:22%;">Monto</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr style="background:#f3f3f3;">
          <td colspan="4" style="padding:10px 12px;font-size:12px;font-weight:700;color:#111;text-align:right;">TOTAL:</td>
          <td style="padding:10px 12px;text-align:right;font-size:14px;font-weight:700;color:#1B4965;font-family:'JetBrains Mono',monospace;">USD ${fmt(totalMonto)}</td>
        </tr></tfoot>
      </table>

      <div style="flex:1;"></div>
      <div style="border-top:1px solid #e5e5e5;padding-top:12px;text-align:center;">
        <p style="font-size:10px;color:#aaa;">Generado por Sistema de Facturación — Personal Eventual</p>
      </div>
    </div>`;
  }

  function openPrintWindow(drafts: InvoiceDraft[], title: string) {
    const batchName = previewBatchName || title;
    // Build summary page only when there are multiple invoices
    const summaryHtml = drafts.length > 1 ? renderSummaryPage(drafts, batchName) : '';
    const allHtml = summaryHtml + drafts.map((d) => renderInvoiceHTML(d)).join('');
    const printWindow = window.open('', '_blank', 'width=800,height=1100');
    if (!printWindow) {
      toast.error('Habilite las ventanas emergentes para imprimir');
      return;
    }
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#fff;font-family:'DM Sans',sans-serif;}
        @media print{@page{size:A4 portrait;margin:0;}body{margin:0;}}
      </style>
    </head><body>${allHtml}
      <script>document.fonts.ready.then(()=>{setTimeout(()=>{window.print();window.close();},500);});<\/script>
    </body></html>`);
    printWindow.document.close();
  }

  const handlePrint = () => {
    if (viewMode === 'preview' && previewDrafts.length > 0) {
      openPrintWindow(previewDrafts, `Lote_${previewBatchName}`);
    } else if (viewMode === 'history-view' && viewingDraft) {
      openPrintWindow([viewingDraft], `Factura_${viewingDraft.numero_factura}`);
    }
  };

  const handleExportPDF = () => {
    handlePrint();
  };

  // ─── TXT ACH Download ─────────────────────────────
  const handleDownloadTXT = (drafts: InvoiceDraft[], filename?: string) => {
    if (drafts.length === 0) return;
    const txt = generarTXTBancario(drafts);
    const name = filename || `ACH_${previewBatchName.replace(/\s+/g, '_') || 'Lote'}_${sharedFecha}.txt`;
    descargarTXT(txt, name);
    toast.success(`Archivo TXT descargado: ${name}`);
  };

  // ─── History handlers ──────────────────────────────
  const handleViewHistoryInvoice = (draft: InvoiceDraft) => {
    setViewingDraft(draft);
    setViewMode('history-view');
    setActiveTab('create');
  };

  const handlePrintBatch = (drafts: InvoiceDraft[]) => {
    openPrintWindow(drafts, 'Lote_Facturas');
  };

  // ─── New batch ─────────────────────────────────────
  const handleNewBatch = useCallback(async () => {
    setViewMode('create');
    setBatchEntries([]);
    setBatchName('');
    setPreviewBatchName('');
    setSelectedPersona(null);
    setShowNewPersonForm(false);
    setCurrentFormData(emptyFormData());
    setCurrentEditIndex(-1);
    setPreviewDrafts([]);
    setIsSaved(false);
    setViewingDraft(null);
    setActiveTab('create');
    setSharedFecha(new Date().toISOString().split('T')[0]);
    setSharedEmpresa('');
  }, []);

  const handleTarifasUpdated = async () => {
    try {
      const t = await obtenerTarifas();
      setTarifas(t);
    } catch {
      // silent
    }
  };

  // ─── Computed ──────────────────────────────────────
  const batchTotal = batchEntries.reduce((s, e) => s + e.formData.totalCalculado, 0);
  const currentDraft = previewDrafts[currentPreviewIdx];
  const canAddToBatch =
    selectedPersona &&
    currentFormData.departamentos.length > 0 &&
    currentFormData.departamentos.every((d) => d.dias > 0) &&
    currentFormData.numeroFactura > 0;

  // ─── Render invoice HTML for print ─────────────────
  function renderInvoiceHTML(draft: InvoiceDraft): string {
    const { persona, departamentos, empresa, fecha, numero_factura, saldo_adeudado } = draft;
    const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const parts = fecha.split('-');
    const fechaFmt = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : fecha;
    const deptNames = departamentos.map((d) => d.departamento).join(', ');

    const rowsHtml = departamentos
      .map(
        (d) => {
          const lineTotal = d.subtotal ?? (d.dias * d.tarifa_diaria + d.horas_extra * d.tarifa_hora_extra);
          return `<tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 12px;font-size:12px;color:#222;font-weight:600;">SERVICIOS PROFESIONALES – ${d.departamento}</td>
        <td style="padding:10px 12px;text-align:center;font-size:12px;color:#444;font-family:'JetBrains Mono',monospace;">${d.dias}</td>
        <td style="padding:10px 12px;text-align:right;font-size:12px;color:#444;font-family:'JetBrains Mono',monospace;">USD ${fmt(d.tarifa_diaria)}</td>
        <td style="padding:10px 12px;text-align:right;font-size:12px;color:#444;font-family:'JetBrains Mono',monospace;">USD ${fmt(lineTotal)}</td>
      </tr>`;
        }
      )
      .join('');

    return `<div style="font-family:'DM Sans',system-ui,sans-serif;padding:28px 36px;height:297mm;box-sizing:border-box;background:#fff;color:#1a1a1a;width:210mm;margin:0 auto;display:flex;flex-direction:column;page-break-after:always;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
        <div>
          <h2 style="font-size:14px;font-weight:700;letter-spacing:0.02em;color:#111;text-transform:uppercase;margin:0;">${persona.nombre_completo}</h2>
          <p style="font-size:12px;color:#666;font-family:'JetBrains Mono',monospace;margin:2px 0 0 0;">${persona.cedula}${persona.dv && persona.dv.trim() ? ` DV${persona.dv.trim()}` : ''}</p>
        </div>
        <div style="text-align:right;">
          <h1 style="font-size:32px;font-weight:300;letter-spacing:0.15em;color:#aaa;line-height:1;margin:0;">FACTURA</h1>
          <p style="font-size:13px;color:#888;font-family:'JetBrains Mono',monospace;margin:4px 0 0 0;"># ${numero_factura}</p>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
        <div>
          <p style="font-size:11px;color:#888;margin:0 0 4px 0;">Cobrar a:</p>
          <p style="font-size:13px;font-weight:700;color:#111;margin:0;">${empresa}</p>
        </div>
        <div style="text-align:right;">
          <div style="display:flex;align-items:center;gap:24px;margin-bottom:6px;border-bottom:1px solid #d0d0d0;padding-bottom:2px;">
            <span style="font-size:11px;color:#888;">Fecha:</span>
            <span style="font-size:12px;color:#444;font-family:'JetBrains Mono',monospace;">${fechaFmt}</span>
          </div>
          <div style="display:flex;align-items:center;gap:24px;padding:6px 12px;margin-top:4px;background:#f3f3f3;">
            <span style="font-size:11px;font-weight:600;color:#444;">Saldo Adeudado:</span>
            <span style="font-size:13px;font-weight:700;color:#111;font-family:'JetBrains Mono',monospace;">USD ${fmt(saldo_adeudado)}</span>
          </div>
        </div>
      </div>
      <div style="margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:#333;">
            <th style="text-align:left;font-size:11px;font-weight:600;color:#fff;padding:8px 12px;width:45%;">Artículo</th>
            <th style="text-align:center;font-size:11px;font-weight:600;color:#fff;padding:8px 12px;width:15%;">Cantidad</th>
            <th style="text-align:right;font-size:11px;font-weight:600;color:#fff;padding:8px 12px;width:20%;">Tasa</th>
            <th style="text-align:right;font-size:11px;font-weight:600;color:#fff;padding:8px 12px;width:20%;">Monto</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:32px;">
        <div style="width:220px;">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;">
            <span style="font-size:11px;color:#888;">Subtotal:</span>
            <span style="font-size:12px;color:#222;font-family:'JetBrains Mono',monospace;">USD ${fmt(saldo_adeudado)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;">
            <span style="font-size:11px;color:#888;">Impuesto (0%):</span>
            <span style="font-size:12px;color:#222;font-family:'JetBrains Mono',monospace;">USD 0.00</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;">
            <span style="font-size:12px;font-weight:700;color:#111;">Total:</span>
            <span style="font-size:13px;font-weight:700;color:#111;font-family:'JetBrains Mono',monospace;">USD ${fmt(saldo_adeudado)}</span>
          </div>
        </div>
      </div>
      <div style="flex:1;"></div>
      <div style="border-top:1px solid #e5e5e5;padding-top:16px;">
        <p style="font-size:11px;color:#888;margin:0 0 6px 0;">Notas:</p>
        <div style="font-size:12px;color:#444;">
          <p style="margin:0 0 6px 0;font-weight:600;color:#222;">Departamento: ${deptNames}</p>
          <p style="margin:0 0 2px 0;">${persona.nombre_banco}</p>
          <p style="margin:0 0 2px 0;">Cuenta de ${persona.tipo_cuenta}</p>
          <p style="margin:0 0 2px 0;font-family:'JetBrains Mono',monospace;">${persona.cuenta_bancaria}</p>
          ${persona.titular_cuenta && persona.titular_cuenta !== persona.nombre_completo ? `<p style="font-size:11px;color:#888;margin:4px 0 0 0;">Titular: ${persona.titular_cuenta}</p>` : ''}
        </div>
      </div>
    </div>`;
  }

  // ─── Loading ───────────────────────────────────────
  if (loadingInit) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#1B4965' }} />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f8f9fa' }}>
      {/* Header */}
      <header className="no-print border-b bg-white/90 backdrop-blur-sm sticky top-0 z-40" style={{ borderColor: '#e5e7eb' }}>
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1B4965' }}>
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight" style={{ color: '#111827' }}>Sistema de Facturación</h1>
              <p className="text-[10px] leading-tight" style={{ color: '#9ca3af' }}>Personal Eventual</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TarifasConfig onTarifasUpdated={handleTarifasUpdated} />
            <Button variant="outline" size="sm" onClick={handleNewBatch} className="h-8 text-xs gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Nuevo Lote
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* ═══ PREVIEW MODE ═══ */}
        {viewMode === 'preview' && currentDraft ? (
          <div>
            <div className="no-print flex items-center justify-between mb-5">
              <Button variant="ghost" size="sm" onClick={() => setViewMode('create')} className="h-8 text-xs gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Volver
              </Button>

              {previewDrafts.length > 1 && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPreviewIdx((i) => Math.max(0, i - 1))} disabled={currentPreviewIdx === 0} className="h-8 w-8 p-0">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs font-medium" style={{ color: '#6b7280' }}>
                    {currentPreviewIdx + 1} de {previewDrafts.length}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPreviewIdx((i) => Math.min(previewDrafts.length - 1, i + 1))} disabled={currentPreviewIdx === previewDrafts.length - 1} className="h-8 w-8 p-0">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                {!isSaved && (
                  <Button size="sm" onClick={handleSaveAll} disabled={isSaving} className="h-8 text-xs gap-1.5" style={{ backgroundColor: '#1B4965' }}>
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Guardar Lote ({previewDrafts.length})
                  </Button>
                )}
                {isSaved && (
                  <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#16a34a' }}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Guardado
                  </span>
                )}
                <Button variant="outline" size="sm" onClick={handlePrint} className="h-8 text-xs gap-1.5">
                  <Printer className="w-3.5 h-3.5" /> Imprimir
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPDF} className="h-8 text-xs gap-1.5">
                  <Download className="w-3.5 h-3.5" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDownloadTXT(previewDrafts)} className="h-8 text-xs gap-1.5" style={{ color: '#16a34a', borderColor: '#bbf7d0' }}>
                  <FileSpreadsheet className="w-3.5 h-3.5" /> TXT ACH
                </Button>
                <Button variant="outline" size="sm" onClick={() => generarExcelLote(previewDrafts, previewBatchName, sharedFecha)} className="h-8 text-xs gap-1.5" style={{ color: '#1B4965', borderColor: '#bfdbfe' }}>
                  <Download className="w-3.5 h-3.5" /> Excel
                </Button>
              </div>
            </div>

            <InvoicePreview draft={currentDraft} id="invoice-content" />

            {/* Batch summary */}
            {previewDrafts.length > 1 && (
              <div className="no-print mt-6">
                <Card className="p-4">
                  <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#9ca3af' }}>
                    Resumen del Lote: {previewBatchName}
                  </h3>
                  <div className="space-y-2">
                    {previewDrafts.map((d, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentPreviewIdx(idx)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                          idx === currentPreviewIdx ? 'border-[#1B4965]/40 bg-[#1B4965]/[0.03]' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono font-medium" style={{ color: '#374151' }}>#{d.numero_factura}</span>
                          <span className="text-sm font-medium" style={{ color: '#374151' }}>{d.persona.nombre_completo}</span>
                          <span className="text-xs" style={{ color: '#9ca3af' }}>
                            {d.departamentos.map((dep) => dep.departamento).join(', ')}
                          </span>
                        </div>
                        <span className="text-sm font-mono font-semibold" style={{ color: '#1B4965' }}>${d.saldo_adeudado.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid #e5e7eb' }}>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-medium" style={{ color: '#6b7280' }}>
                        {previewDrafts.length} factura{previewDrafts.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="text-sm font-bold font-mono" style={{ color: '#1B4965' }}>
                      Total: ${previewDrafts.reduce((s, d) => s + d.saldo_adeudado, 0).toFixed(2)}
                    </span>
                  </div>
                </Card>
              </div>
            )}
          </div>
        ) : viewMode === 'history-view' && viewingDraft ? (
          /* ═══ HISTORY VIEW ═══ */
          <div>
            <div className="no-print flex items-center justify-between mb-5">
              <Button variant="ghost" size="sm" onClick={() => { setViewMode('create'); setViewingDraft(null); setActiveTab('history'); }} className="h-8 text-xs gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Volver
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint} className="h-8 text-xs gap-1.5">
                  <Printer className="w-3.5 h-3.5" /> Imprimir
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPDF} className="h-8 text-xs gap-1.5">
                  <Download className="w-3.5 h-3.5" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDownloadTXT([viewingDraft])} className="h-8 text-xs gap-1.5" style={{ color: '#16a34a', borderColor: '#bbf7d0' }}>
                  <FileSpreadsheet className="w-3.5 h-3.5" /> TXT ACH
                </Button>
              </div>
            </div>
            <InvoicePreview draft={viewingDraft} id="invoice-content" />
          </div>
        ) : (
          /* ═══ CREATE MODE — TABS ═══ */
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="no-print mb-5 bg-white border" style={{ borderColor: '#e5e7eb' }}>
              <TabsTrigger value="create" className="text-xs gap-1.5 data-[state=active]:text-white" style={{ '--tw-bg-opacity': '1' } as any}>
                <Plus className="w-3.5 h-3.5" /> Crear Lote
              </TabsTrigger>
              <TabsTrigger value="pagos" className="text-xs gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> Pagos
              </TabsTrigger>
              <TabsTrigger value="colaboradores" className="text-xs gap-1.5">
                <Users className="w-3.5 h-3.5" /> Eventuales
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs gap-1.5">
                <History className="w-3.5 h-3.5" /> Historial
              </TabsTrigger>
            </TabsList>

            {/* ── TAB: Crear Lote (manual) ── */}
            <TabsContent value="create">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Left: Form (3 cols) */}
                <div className="lg:col-span-3 space-y-5">
                  {/* Batch info */}
                  <Card className="p-5">
                    <h2 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#9ca3af' }}>
                      Información del Lote
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs mb-1.5">Nombre del Lote</Label>
                        <Input
                          value={batchName}
                          onChange={(e) => setBatchName(e.target.value)}
                          placeholder="Ej: Semana 12 - Marzo"
                          className="h-10 text-sm bg-white"
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5">Fecha</Label>
                        <Input
                          type="date"
                          value={sharedFecha}
                          onChange={(e) => setSharedFecha(e.target.value)}
                          className="h-10 text-sm bg-white font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5">Empresa</Label>
                        <Select value={sharedEmpresa} onValueChange={setSharedEmpresa}>
                          <SelectTrigger className="h-10 text-sm bg-white">
                            <SelectValue placeholder="Seleccionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Casa Bruja, S.A.">Casa Bruja, S.A.</SelectItem>
                            <SelectItem value="Lost Origin, S.A.">Lost Origin, S.A.</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </Card>

                  {/* Add person */}
                  <Card className="p-5">
                    <h2 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#9ca3af' }}>
                      {currentEditIndex >= 0 ? 'Editar Persona' : 'Agregar Persona al Lote'}
                    </h2>

                    <PersonSearch
                      onSelect={handlePersonSelected}
                      onClear={handleClearPerson}
                      selectedPersona={selectedPersona}
                    />

                    {!selectedPersona && !showNewPersonForm && (
                      <Button variant="ghost" size="sm" onClick={() => setShowNewPersonForm(true)} className="mt-3 h-8 text-xs gap-1.5" style={{ color: '#1B4965' }}>
                        <UserPlus className="w-3.5 h-3.5" /> Registrar nueva persona
                      </Button>
                    )}

                    {showNewPersonForm && !selectedPersona && (
                      <div className="mt-4 pt-4" style={{ borderTop: '1px solid #f3f4f6' }}>
                        <PersonForm onPersonCreated={handlePersonCreated} onCancel={() => setShowNewPersonForm(false)} />
                      </div>
                    )}

                    {selectedPersona && (
                      <div className="mt-4 pt-4" style={{ borderTop: '1px solid #f3f4f6' }}>
                        <InvoiceForm
                          data={currentFormData}
                          onChange={setCurrentFormData}
                          tarifas={tarifas}
                          persona={selectedPersona}
                        />
                        <div className="mt-4">
                          <Button
                            onClick={handleAddToBatch}
                            disabled={!canAddToBatch}
                            className="w-full h-10 text-sm font-medium gap-2"
                            style={{ backgroundColor: canAddToBatch ? '#1B4965' : undefined }}
                          >
                            <Plus className="w-4 h-4" />
                            {currentEditIndex >= 0 ? 'Actualizar en Lote' : 'Agregar al Lote'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>

                  {/* Generate button */}
                  {batchEntries.length > 0 && (
                    <Button
                      onClick={handleGenerateAll}
                      disabled={!sharedEmpresa || !batchName.trim()}
                      className="w-full h-12 text-sm font-semibold gap-2"
                      style={{ backgroundColor: '#1B4965' }}
                    >
                      <FileText className="w-4 h-4" />
                      Generar {batchEntries.length} Factura{batchEntries.length !== 1 ? 's' : ''} — ${batchTotal.toFixed(2)}
                    </Button>
                  )}
                </div>

                {/* Right: Batch list (2 cols) */}
                <div className="lg:col-span-2">
                  <div className="sticky top-20">
                    <Card className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-xs font-medium uppercase tracking-wider" style={{ color: '#9ca3af' }}>
                          <Package className="w-3.5 h-3.5 inline mr-1" />
                          Lote Actual
                        </h2>
                        <span className="text-xs font-mono font-bold" style={{ color: '#1B4965' }}>
                          {batchEntries.length} persona{batchEntries.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {batchEntries.length === 0 ? (
                        <div className="text-center py-8">
                          <UserPlus className="w-10 h-10 mx-auto mb-2" style={{ color: '#d1d5db' }} />
                          <p className="text-sm" style={{ color: '#9ca3af' }}>Agregue personas al lote</p>
                          <p className="text-xs mt-1" style={{ color: '#d1d5db' }}>Busque o registre personas y seleccione sus departamentos</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {batchEntries.map((entry, idx) => {
                            const deptNames = entry.formData.departamentos.map((d) => d.departamento).join(', ');
                            return (
                              <div key={idx} className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: '#e5e7eb' }}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}>
                                      #{entry.formData.numeroFactura}
                                    </span>
                                    <span className="text-sm font-medium truncate" style={{ color: '#374151' }}>
                                      {entry.persona.nombre_completo}
                                    </span>
                                  </div>
                                  <div className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                                    {deptNames}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 ml-2">
                                  <span className="text-sm font-mono font-semibold" style={{ color: '#1B4965' }}>
                                    ${entry.formData.totalCalculado.toFixed(2)}
                                  </span>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEditBatchEntry(idx)}>
                                    <svg className="w-3.5 h-3.5" style={{ color: '#6b7280' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleRemoveFromBatch(idx)}>
                                    <svg className="w-3.5 h-3.5" style={{ color: '#ef4444' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </Button>
                                </div>
                              </div>
                            );
                          })}

                          {/* Total with invoice count */}
                          <div className="pt-3 mt-2" style={{ borderTop: '1px solid #e5e7eb' }}>
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs font-medium" style={{ color: '#6b7280' }}>Total del Lote</span>
                                <span className="text-xs ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>
                                  {batchEntries.length} factura{batchEntries.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <span className="text-base font-bold font-mono" style={{ color: '#1B4965' }}>
                                ${batchTotal.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </Card>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── TAB: Pagos Eventuales ── */}
            <TabsContent value="pagos">
              <Card className="p-5">
                <PagosColaboradores
                  onGenerateInvoices={handlePagosGenerate}
                  refreshKey={colabRefreshKey}
                />
              </Card>
            </TabsContent>

            {/* ── TAB: Eventuales ── */}
            <TabsContent value="colaboradores">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold" style={{ color: '#111827' }}>Gestión de Eventuales</h2>
                </div>
                <ColaboradoresManager
                  onColaboradoresChanged={() => setColabRefreshKey((k) => k + 1)}
                  /* Renamed to Eventuales */
                />
              </Card>
            </TabsContent>

            {/* ── TAB: Historial ── */}
            <TabsContent value="history">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold" style={{ color: '#111827' }}>Historial de Lotes</h2>
                </div>
                <InvoiceHistory
                  onViewInvoice={handleViewHistoryInvoice}
                  onPrintBatch={handlePrintBatch}
                  onDownloadCSV={handleDownloadTXT}
                  refreshKey={refreshKey}
                />
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
