/**
 * Home Page - Invoice Generation System
 * ======================================
 * Design: Corporate Precision
 * - Left panel: Form (search person, register, invoice data)
 * - Right panel: Live invoice preview + actions
 * - Bottom: Invoice history
 */

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PersonSearch from '@/components/PersonSearch';
import PersonForm from '@/components/PersonForm';
import InvoiceForm from '@/components/InvoiceForm';
import InvoicePreview from '@/components/InvoicePreview';
import InvoiceHistory from '@/components/InvoiceHistory';
import {
  crearFactura,
  obtenerSiguienteNumeroFactura,
  type Persona,
  type Factura,
} from '@/lib/supabase';
import {
  FileText,
  Printer,
  Download,
  Save,
  Plus,
  History,
  Loader2,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';


type ViewMode = 'create' | 'preview' | 'history-view';

export default function Home() {
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [showNewPersonForm, setShowNewPersonForm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('create');
  const [isSaving, setIsSaving] = useState(false);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState('create');
  const [invoiceData, setInvoiceData] = useState({
    numero_factura: 0,
    fecha: new Date().toISOString().split('T')[0],
    empresa: '',
    saldo_adeudado: 0,
  });
  // For viewing saved invoices from history
  const [viewingFactura, setViewingFactura] = useState<Factura | null>(null);

  const invoiceRef = useRef<HTMLDivElement>(null);

  const isFormValid =
    selectedPersona &&
    invoiceData.numero_factura > 0 &&
    invoiceData.fecha &&
    invoiceData.empresa &&
    invoiceData.saldo_adeudado > 0;

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

  const handlePreview = () => {
    if (!isFormValid) {
      toast.error('Complete todos los campos antes de previsualizar');
      return;
    }
    setViewMode('preview');
  };

  const handleSaveInvoice = async () => {
    if (!isFormValid || !selectedPersona?.id) return;

    setIsSaving(true);
    try {
      await crearFactura({
        numero_factura: invoiceData.numero_factura,
        fecha: invoiceData.fecha,
        empresa: invoiceData.empresa,
        saldo_adeudado: invoiceData.saldo_adeudado,
        persona_id: selectedPersona.id,
      });
      toast.success(`Factura #${invoiceData.numero_factura} guardada exitosamente`);
      setRefreshTrigger((prev) => prev + 1);

      // Load next invoice number
      const nextNum = await obtenerSiguienteNumeroFactura();
      setInvoiceData((prev) => ({ ...prev, numero_factura: nextNum }));
    } catch (err: any) {
      if (err?.message?.includes('duplicate') || err?.code === '23505') {
        toast.error('Ya existe una factura con ese número');
      } else {
        toast.error('Error al guardar factura: ' + (err?.message || 'Error desconocido'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    const element = document.getElementById('invoice-content');
    if (!element) return;

    // Use a new window with inline styles for PDF generation via print dialog
    const printWindow = window.open('', '_blank', 'width=800,height=1100');
    if (!printWindow) {
      toast.error('Habilite las ventanas emergentes para generar el PDF');
      return;
    }

    const personName = selectedPersona?.nombre_completo || viewingFactura?.persona?.nombre_completo || 'factura';
    const invoiceNum = invoiceData.numero_factura || viewingFactura?.numero_factura || 0;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Factura_${invoiceNum}_${personName.replace(/\s+/g, '_')}</title>
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
        ${element.outerHTML}
        <script>
          // Wait for fonts to load then trigger print
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
  };

  const handleNewInvoice = useCallback(() => {
    setViewMode('create');
    setViewingFactura(null);
    setSelectedPersona(null);
    setShowNewPersonForm(false);
    setInvoiceData({
      numero_factura: 0,
      fecha: new Date().toISOString().split('T')[0],
      empresa: '',
      saldo_adeudado: 0,
    });
    setActiveTab('create');
    // Reload next number
    obtenerSiguienteNumeroFactura().then((num) => {
      setInvoiceData((prev) => ({ ...prev, numero_factura: num }));
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

  const previewInvoice = viewMode === 'history-view' && viewingFactura
    ? {
        numero_factura: viewingFactura.numero_factura,
        fecha: viewingFactura.fecha,
        empresa: viewingFactura.empresa,
        saldo_adeudado: Number(viewingFactura.saldo_adeudado),
      }
    : invoiceData;

  const showPreview = (viewMode === 'preview' || viewMode === 'history-view') && previewPersona;

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
              <div className="flex items-center gap-2">
                {viewMode === 'preview' && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSaveInvoice}
                    disabled={isSaving}
                    className="h-8 text-xs gap-1.5"
                  >
                    {isSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Guardar
                  </Button>
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
                  onClick={handleExportPDF}
                  className="h-8 text-xs gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Generar PDF
                </Button>
              </div>
            </div>

            {/* Invoice Preview */}
            <div ref={invoiceRef}>
              <InvoicePreview
                persona={previewPersona}
                factura={previewInvoice}
              />
            </div>
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
                      data={invoiceData}
                      onChange={setInvoiceData}
                    />
                  </Card>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <Button
                      onClick={handlePreview}
                      disabled={!isFormValid}
                      className="flex-1 h-11 text-sm font-medium gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      Crear Factura
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
                      {selectedPersona && invoiceData.empresa ? (
                        <InvoicePreview
                          persona={selectedPersona}
                          factura={invoiceData}
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
                            Seleccione una persona y complete los datos de factura
                          </p>
                        </div>
                      )}
                    </div>
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
