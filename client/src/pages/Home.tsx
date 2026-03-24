/**
 * Home Page - Invoice Generation System
 * ======================================
 * Design: Corporate Precision
 * - Left panel: Form (search person, register, invoice data with departments)
 * - Right panel: Live invoice preview
 * - Supports batch generation: one invoice per selected department
 * - Batch save and batch print/PDF
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PersonSearch from '@/components/PersonSearch';
import PersonForm from '@/components/PersonForm';
import InvoiceForm, { type InvoiceFormData } from '@/components/InvoiceForm';
import InvoicePreview from '@/components/InvoicePreview';
import InvoiceHistory from '@/components/InvoiceHistory';
import {
  crearFacturasBatch,
  obtenerSiguienteNumeroFactura,
  calcularTotalDepartamento,
  DEPARTAMENTOS,
  TARIFA_HORA_EXTRA,
  type Persona,
  type Factura,
  type DepartamentoEntry,
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
} from 'lucide-react';
import { toast } from 'sonner';

type ViewMode = 'create' | 'preview' | 'history-view';

// Build a single invoice data object from a DepartamentoEntry
function buildInvoiceFromDept(
  entry: DepartamentoEntry,
  baseNum: number,
  index: number,
  fecha: string,
  empresa: string
) {
  const dept = DEPARTAMENTOS[entry.key];
  const montoDias = entry.dias * dept.tarifa;
  const montoExtras = entry.horasExtra * TARIFA_HORA_EXTRA;
  const total = montoDias + montoExtras;

  return {
    numero_factura: baseNum + index,
    fecha,
    empresa,
    saldo_adeudado: total,
    departamento: dept.label.toUpperCase(),
    dias_trabajados: entry.dias,
    tarifa_diaria: dept.tarifa,
    horas_extra: entry.horasExtra,
    monto_horas_extra: montoExtras,
  };
}

export default function Home() {
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [showNewPersonForm, setShowNewPersonForm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('create');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState('create');

  const [invoiceFormData, setInvoiceFormData] = useState<InvoiceFormData>({
    numero_factura: 0,
    fecha: new Date().toISOString().split('T')[0],
    empresa: '',
    departamentos: [],
  });

  // Generated invoices (one per department)
  const [generatedInvoices, setGeneratedInvoices] = useState<
    Array<{
      numero_factura: number;
      fecha: string;
      empresa: string;
      saldo_adeudado: number;
      departamento: string;
      dias_trabajados: number;
      tarifa_diaria: number;
      horas_extra: number;
      monto_horas_extra: number;
    }>
  >([]);
  const [currentInvoiceIndex, setCurrentInvoiceIndex] = useState(0);

  // For viewing saved invoices from history
  const [viewingFactura, setViewingFactura] = useState<Factura | null>(null);

  const hasValidDepts = invoiceFormData.departamentos.length > 0 &&
    invoiceFormData.departamentos.every((d) => d.dias > 0);

  const isFormValid =
    selectedPersona &&
    invoiceFormData.numero_factura > 0 &&
    invoiceFormData.fecha &&
    invoiceFormData.empresa &&
    hasValidDepts;

  const handlePersonSelected = (persona: Persona) => {
    setSelectedPersona(persona);
    setShowNewPersonForm(false);
  };

  const handlePersonCreated = (persona: Persona) => {
    setSelectedPersona(persona);
    setShowNewPersonForm(false);
  };

  const handleClearPerson = () => {
    setSelectedPersona(null);
    setShowNewPersonForm(false);
  };

  const handleGenerateInvoices = () => {
    if (!isFormValid) {
      toast.error('Complete todos los campos y asegúrese de que cada departamento tenga días trabajados');
      return;
    }

    // Generate one invoice per selected department
    const invoices = invoiceFormData.departamentos.map((entry, idx) =>
      buildInvoiceFromDept(
        entry,
        invoiceFormData.numero_factura,
        idx,
        invoiceFormData.fecha,
        invoiceFormData.empresa
      )
    );

    setGeneratedInvoices(invoices);
    setCurrentInvoiceIndex(0);
    setIsSaved(false);
    setViewMode('preview');
  };

  const handleSaveAllInvoices = async () => {
    if (!selectedPersona?.id || generatedInvoices.length === 0) return;

    setIsSaving(true);
    try {
      const facturas = generatedInvoices.map((inv) => ({
        ...inv,
        persona_id: selectedPersona.id!,
      }));

      await crearFacturasBatch(facturas);
      toast.success(
        `${generatedInvoices.length} factura${generatedInvoices.length > 1 ? 's' : ''} guardada${generatedInvoices.length > 1 ? 's' : ''} exitosamente`
      );
      setRefreshTrigger((prev) => prev + 1);
      setIsSaved(true);
    } catch (err: any) {
      if (err?.message?.includes('duplicate') || err?.code === '23505') {
        toast.error('Ya existe una factura con alguno de esos números');
      } else {
        toast.error('Error al guardar facturas: ' + (err?.message || 'Error desconocido'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    if (viewMode === 'preview' && selectedPersona && generatedInvoices.length > 0) {
      // Batch print: render ALL invoices in a print window
      const allHtml = generatedInvoices.map((inv) => renderInvoiceHTML(selectedPersona, inv)).join('');
      const printWindow = window.open('', '_blank', 'width=800,height=1100');
      if (!printWindow) {
        toast.error('Habilite las ventanas emergentes para imprimir');
        return;
      }
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Imprimir Facturas</title>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
          <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #fff; font-family: 'DM Sans', sans-serif; }
            @media print {
              @page { size: A4; margin: 0; }
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          ${allHtml}
          <script>
            document.fonts.ready.then(() => {
              setTimeout(() => { window.print(); window.close(); }, 500);
            });
          <\/script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      window.print();
    }
  };

  const handleExportAllPDF = () => {
    if (viewMode === 'preview' && selectedPersona && generatedInvoices.length > 0) {
      // Batch mode: render ALL invoices using renderInvoiceHTML
      const allHtml = generatedInvoices.map((inv) => renderInvoiceHTML(selectedPersona, inv)).join('');
      openPrintWindow(allHtml, `Facturas_${selectedPersona.nombre_completo.replace(/\s+/g, '_')}`);
    } else if (viewMode === 'history-view' && viewingFactura?.persona) {
      // Single invoice from history
      const inv = {
        numero_factura: viewingFactura.numero_factura,
        fecha: viewingFactura.fecha,
        empresa: viewingFactura.empresa,
        saldo_adeudado: Number(viewingFactura.saldo_adeudado),
        departamento: viewingFactura.departamento || '',
        dias_trabajados: viewingFactura.dias_trabajados || 0,
        tarifa_diaria: viewingFactura.tarifa_diaria || 0,
        horas_extra: viewingFactura.horas_extra || 0,
        monto_horas_extra: viewingFactura.monto_horas_extra || 0,
      };
      const html = renderInvoiceHTML(viewingFactura.persona, inv);
      openPrintWindow(html, `Factura_${viewingFactura.numero_factura}`);
    }
  };

  function renderInvoiceHTML(persona: Persona, inv: typeof generatedInvoices[0]) {
    const formatCurrency = (n: number) => `USD ${n.toFixed(2)}`;
    const formatDate = (d: string) => {
      try {
        const dt = new Date(d + 'T12:00:00');
        return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
      } catch { return d; }
    };

    const montoDias = inv.dias_trabajados * inv.tarifa_diaria;
    const montoExtras = inv.monto_horas_extra;
    const total = inv.saldo_adeudado;

    let rowsHtml = `
      <tr style="border-bottom: 1px solid #f0f0f0;">
        <td style="padding: 10px 12px; font-size: 12px; color: #222; font-weight: 600;">SERVICIOS PROFESIONALES - ${inv.departamento}</td>
        <td style="padding: 10px 12px; text-align: center; font-size: 12px; color: #444; font-family: 'JetBrains Mono', monospace;">${inv.dias_trabajados}</td>
        <td style="padding: 10px 12px; text-align: right; font-size: 12px; color: #444; font-family: 'JetBrains Mono', monospace;">${formatCurrency(inv.tarifa_diaria)}</td>
        <td style="padding: 10px 12px; text-align: right; font-size: 12px; color: #444; font-family: 'JetBrains Mono', monospace;">${formatCurrency(montoDias)}</td>
      </tr>`;

    if (inv.horas_extra > 0) {
      rowsHtml += `
      <tr style="border-bottom: 1px solid #f0f0f0;">
        <td style="padding: 10px 12px; font-size: 12px; color: #222; font-weight: 600;">HORAS EXTRA</td>
        <td style="padding: 10px 12px; text-align: center; font-size: 12px; color: #444; font-family: 'JetBrains Mono', monospace;">${inv.horas_extra}</td>
        <td style="padding: 10px 12px; text-align: right; font-size: 12px; color: #444; font-family: 'JetBrains Mono', monospace;">${formatCurrency(5)}</td>
        <td style="padding: 10px 12px; text-align: right; font-size: 12px; color: #444; font-family: 'JetBrains Mono', monospace;">${formatCurrency(montoExtras)}</td>
      </tr>`;
    }

    return `
    <div style="font-family: 'DM Sans', system-ui, sans-serif; padding: 28px 36px; height: 270mm; box-sizing: border-box; background: #fff; color: #1a1a1a; width: 100%; max-width: 210mm; margin: 0 auto; display: flex; flex-direction: column; page-break-after: always;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px;">
        <div>
          <h2 style="font-size: 14px; font-weight: 700; letter-spacing: 0.02em; color: #111; text-transform: uppercase; margin: 0;">${persona.nombre_completo}</h2>
          <p style="font-size: 12px; color: #666; font-family: 'JetBrains Mono', monospace; margin: 2px 0 0 0;">${persona.cedula}${persona.dv ? ` DV${persona.dv}` : ''}</p>
        </div>
        <div style="text-align: right;">
          <h1 style="font-size: 32px; font-weight: 300; letter-spacing: 0.15em; color: #aaa; line-height: 1; margin: 0;">FACTURA</h1>
          <p style="font-size: 13px; color: #888; font-family: 'JetBrains Mono', monospace; margin: 4px 0 0 0;"># ${inv.numero_factura}</p>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px;">
        <div>
          <p style="font-size: 11px; color: #888; margin: 0 0 4px 0;">Cobrar a:</p>
          <p style="font-size: 13px; font-weight: 700; color: #111; margin: 0;">${inv.empresa}</p>
        </div>
        <div style="text-align: right;">
          <div style="display: flex; align-items: center; gap: 24px; margin-bottom: 6px; border-bottom: 1px solid #d0d0d0; padding-bottom: 2px;">
            <span style="font-size: 11px; color: #888;">Fecha:</span>
            <span style="font-size: 12px; color: #444; font-family: 'JetBrains Mono', monospace;">${formatDate(inv.fecha)}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 24px; padding: 6px 12px; margin-top: 4px; background: #f3f3f3;">
            <span style="font-size: 11px; font-weight: 600; color: #444;">Saldo Adeudado:</span>
            <span style="font-size: 13px; font-weight: 700; color: #111; font-family: 'JetBrains Mono', monospace;">${formatCurrency(total)}</span>
          </div>
        </div>
      </div>
      <div style="margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #333;">
              <th style="text-align: left; font-size: 11px; font-weight: 600; color: #fff; padding: 8px 12px; width: 45%;">Artículo</th>
              <th style="text-align: center; font-size: 11px; font-weight: 600; color: #fff; padding: 8px 12px; width: 15%;">Cantidad</th>
              <th style="text-align: right; font-size: 11px; font-weight: 600; color: #fff; padding: 8px 12px; width: 20%;">Tasa</th>
              <th style="text-align: right; font-size: 11px; font-weight: 600; color: #fff; padding: 8px 12px; width: 20%;">Monto</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div style="display: flex; justify-content: flex-end; margin-bottom: 32px;">
        <div style="width: 220px;">
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0;">
            <span style="font-size: 11px; color: #888;">Subtotal:</span>
            <span style="font-size: 12px; color: #222; font-family: 'JetBrains Mono', monospace;">${formatCurrency(total)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0;">
            <span style="font-size: 11px; color: #888;">Impuesto (0%):</span>
            <span style="font-size: 12px; color: #222; font-family: 'JetBrains Mono', monospace;">USD 0.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 10px 0;">
            <span style="font-size: 12px; font-weight: 700; color: #111;">Total:</span>
            <span style="font-size: 13px; font-weight: 700; color: #111; font-family: 'JetBrains Mono', monospace;">${formatCurrency(total)}</span>
          </div>
        </div>
      </div>
      <div style="flex: 1;"></div>
      <div style="border-top: 1px solid #e5e5e5; padding-top: 16px;">
        <p style="font-size: 11px; color: #888; margin: 0 0 6px 0;">Notas:</p>
        <div style="font-size: 12px; color: #444;">
          <p style="margin: 0 0 6px 0; font-weight: 600; color: #222;">Departamento: ${inv.departamento}</p>
          <p style="margin: 0 0 2px 0;">${persona.nombre_banco}</p>
          <p style="margin: 0 0 2px 0;">Cuenta de ${persona.tipo_cuenta}</p>
          <p style="margin: 0 0 2px 0; font-family: 'JetBrains Mono', monospace;">${persona.cuenta_bancaria}</p>
          ${persona.titular_cuenta && persona.titular_cuenta !== persona.nombre_completo ? `<p style="font-size: 11px; color: #888; margin: 4px 0 0 0;">Titular: ${persona.titular_cuenta}</p>` : ''}
        </div>
      </div>
    </div>`;
  }

  function openPrintWindow(html: string, title: string) {
    const printWindow = window.open('', '_blank', 'width=800,height=1100');
    if (!printWindow) {
      toast.error('Habilite las ventanas emergentes para generar el PDF');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #fff; font-family: 'DM Sans', sans-serif; }
          @media print {
            @page { size: A4; margin: 0; }
            body { margin: 0; }
            .page-break { page-break-before: always; }
          }
        </style>
      </head>
      <body>
        ${html}
        <script>
          document.fonts.ready.then(() => {
            setTimeout(() => {
              window.print();
              window.close();
            }, 500);
          });
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  const handleNewInvoice = useCallback(() => {
    setViewMode('create');
    setViewingFactura(null);
    setSelectedPersona(null);
    setShowNewPersonForm(false);
    setGeneratedInvoices([]);
    setCurrentInvoiceIndex(0);
    setIsSaved(false);
    setInvoiceFormData({
      numero_factura: 0,
      fecha: new Date().toISOString().split('T')[0],
      empresa: '',
      departamentos: [],
    });
    setActiveTab('create');
    obtenerSiguienteNumeroFactura().then((num) => {
      setInvoiceFormData((prev) => ({ ...prev, numero_factura: num }));
    });
  }, []);

  const handleViewHistoryInvoice = (factura: Factura) => {
    setViewingFactura(factura);
    setViewMode('history-view');
    setActiveTab('create');
  };

  // Determine what to show in preview
  const previewPersona = viewMode === 'history-view' && viewingFactura?.persona
    ? viewingFactura.persona
    : selectedPersona;

  const currentGeneratedInvoice = generatedInvoices[currentInvoiceIndex];

  const previewInvoice = viewMode === 'history-view' && viewingFactura
    ? {
        numero_factura: viewingFactura.numero_factura,
        fecha: viewingFactura.fecha,
        empresa: viewingFactura.empresa,
        saldo_adeudado: Number(viewingFactura.saldo_adeudado),
        departamento: viewingFactura.departamento,
        dias_trabajados: viewingFactura.dias_trabajados,
        tarifa_diaria: viewingFactura.tarifa_diaria,
        horas_extra: viewingFactura.horas_extra,
        monto_horas_extra: viewingFactura.monto_horas_extra,
      }
    : currentGeneratedInvoice || null;

  const showPreview = (viewMode === 'preview' || viewMode === 'history-view') && previewPersona && previewInvoice;

  // For the mini live preview in create mode, show first dept if available
  const livePreviewInvoice = invoiceFormData.departamentos.length > 0 && invoiceFormData.departamentos[0].dias > 0
    ? buildInvoiceFromDept(
        invoiceFormData.departamentos[0],
        invoiceFormData.numero_factura,
        0,
        invoiceFormData.fecha,
        invoiceFormData.empresa
      )
    : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="no-print border-b border-gray-200/80 bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground leading-tight">
                Sistema de Facturación
              </h1>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Personal Eventual
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewInvoice}
            className="h-8 text-xs gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva Factura
          </Button>
        </div>
      </header>

      <main className="container py-6">
        {showPreview ? (
          /* ============ PREVIEW MODE ============ */
          <div>
            {/* Action bar */}
            <div className="no-print flex items-center justify-between mb-5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (viewMode === 'history-view') {
                    setViewMode('create');
                    setViewingFactura(null);
                    setActiveTab('history');
                  } else {
                    setViewMode('create');
                  }
                }}
                className="h-8 text-xs gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Volver
              </Button>

              {/* Invoice navigation for batch */}
              {viewMode === 'preview' && generatedInvoices.length > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentInvoiceIndex((i) => Math.max(0, i - 1))}
                    disabled={currentInvoiceIndex === 0}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs font-medium text-muted-foreground">
                    Factura {currentInvoiceIndex + 1} de {generatedInvoices.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentInvoiceIndex((i) => Math.min(generatedInvoices.length - 1, i + 1))}
                    disabled={currentInvoiceIndex === generatedInvoices.length - 1}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                {viewMode === 'preview' && !isSaved && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSaveAllInvoices}
                    disabled={isSaving}
                    className="h-8 text-xs gap-1.5"
                  >
                    {isSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Guardar {generatedInvoices.length > 1 ? `Todas (${generatedInvoices.length})` : ''}
                  </Button>
                )}
                {viewMode === 'preview' && isSaved && (
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Guardadas
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  className="h-8 text-xs gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportAllPDF}
                  className="h-8 text-xs gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  {generatedInvoices.length > 1 ? 'PDF Todas' : 'Generar PDF'}
                </Button>
              </div>
            </div>

            {/* Invoice Preview */}
            {previewPersona && previewInvoice && (
              <InvoicePreview
                persona={previewPersona}
                factura={previewInvoice}
              />
            )}

            {/* Batch summary below */}
            {viewMode === 'preview' && generatedInvoices.length > 1 && (
              <div className="no-print mt-6">
                <Card className="p-4">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Resumen de Facturas Generadas
                  </h3>
                  <div className="space-y-2">
                    {generatedInvoices.map((inv, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentInvoiceIndex(idx)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                          idx === currentInvoiceIndex
                            ? 'border-primary/40 bg-primary/[0.03]'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono-numbers font-medium text-foreground">
                            #{inv.numero_factura}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {inv.departamento}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {inv.dias_trabajados} días
                            {inv.horas_extra > 0 && ` + ${inv.horas_extra} hrs extra`}
                          </span>
                        </div>
                        <span className="text-sm font-mono-numbers font-semibold text-foreground">
                          ${inv.saldo_adeudado.toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                    <span className="text-xs font-medium text-muted-foreground">Total General</span>
                    <span className="text-sm font-bold font-mono-numbers text-foreground">
                      ${generatedInvoices.reduce((s, i) => s + i.saldo_adeudado, 0).toFixed(2)}
                    </span>
                  </div>
                </Card>
              </div>
            )}
          </div>
        ) : (
          /* ============ CREATE MODE ============ */
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="no-print mb-5 bg-white border border-gray-200">
              <TabsTrigger value="create" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Plus className="w-3.5 h-3.5" />
                Crear Factura
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <History className="w-3.5 h-3.5" />
                Historial
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Panel: Form */}
                <div className="space-y-5">
                  {/* Person Search */}
                  <Card className="p-5">
                    <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                      1. Seleccionar Persona
                    </h2>
                    <PersonSearch
                      onSelect={handlePersonSelected}
                      onClear={handleClearPerson}
                      selectedPersona={selectedPersona}
                    />
                    {!selectedPersona && !showNewPersonForm && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowNewPersonForm(true)}
                        className="mt-3 h-8 text-xs gap-1.5 text-primary"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Registrar nueva persona
                      </Button>
                    )}
                  </Card>

                  {/* New Person Form (conditional) */}
                  {showNewPersonForm && !selectedPersona && (
                    <Card className="p-5">
                      <PersonForm
                        onPersonCreated={handlePersonCreated}
                        onCancel={() => setShowNewPersonForm(false)}
                      />
                    </Card>
                  )}

                  {/* Invoice Data */}
                  <Card className="p-5">
                    <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                      2. Datos de Factura
                    </h2>
                    <InvoiceForm
                      data={invoiceFormData}
                      onChange={setInvoiceFormData}
                    />
                  </Card>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <Button
                      onClick={handleGenerateInvoices}
                      disabled={!isFormValid}
                      className="flex-1 h-11 text-sm font-medium gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      {invoiceFormData.departamentos.length > 1
                        ? `Crear ${invoiceFormData.departamentos.length} Facturas`
                        : 'Crear Factura'}
                    </Button>
                  </div>
                </div>

                {/* Right Panel: Live Mini Preview */}
                <div className="hidden lg:block">
                  <div className="sticky top-20">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                      Vista Previa
                    </p>
                    <div
                      className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm"
                      style={{ transform: 'scale(0.65)', transformOrigin: 'top left', width: '153.8%' }}
                    >
                      {selectedPersona && invoiceFormData.empresa && livePreviewInvoice ? (
                        <InvoicePreview
                          persona={selectedPersona}
                          factura={livePreviewInvoice}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center py-32 text-center px-8">
                          <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
                            <FileText className="w-7 h-7 text-gray-300" />
                          </div>
                          <p className="text-sm text-gray-400">
                            Complete el formulario para ver la vista previa
                          </p>
                          <p className="text-xs text-gray-300 mt-1">
                            Seleccione una persona, empresa y al menos un departamento
                          </p>
                        </div>
                      )}
                    </div>
                    {invoiceFormData.departamentos.length > 1 && (
                      <p className="text-[10px] text-muted-foreground mt-2 text-center">
                        Vista previa del primer departamento. Se generarán {invoiceFormData.departamentos.length} facturas.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="history">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-foreground">
                    Historial de Facturas
                  </h2>
                </div>
                <InvoiceHistory
                  onViewInvoice={handleViewHistoryInvoice}
                  refreshTrigger={refreshTrigger}
                />
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
