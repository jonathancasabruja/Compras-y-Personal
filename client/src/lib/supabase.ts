/**
 * Data access layer for Compras-y-Personal.
 *
 * File name kept as legacy — we no longer talk to Supabase directly. Every
 * database call goes through our server-side tRPC API which uses the
 * postgres superuser connection, so the anon key is never exposed to the
 * browser.
 *
 * Public API matches the previous Supabase-based version; callers do not
 * change.
 */

// ─── Types ───────────────────────────────────────────────

export interface Persona {
  id?: number;
  nombre_completo: string;
  cedula: string;
  dv: string;
  cuenta_bancaria: string;
  nombre_banco: string;
  tipo_cuenta: string;
  titular_cuenta: string;
  activo?: boolean;
  departamento_principal?: string;
}

export interface TarifaDepartamento {
  id: number;
  clave: string;
  nombre: string;
  tarifa_diaria: number;
  tarifa_hora_extra: number;
}

export interface TarifaPersona {
  id?: number;
  persona_id: number;
  departamento_clave: string;
  tarifa_diaria: number;
  tarifa_hora_extra: number;
}

export interface DeptLineItem {
  departamento: string;
  clave: string;
  dias: number;
  tarifa_diaria: number;
  horas_extra: number;
  tarifa_hora_extra: number;
  subtotal: number;
}

export interface Lote {
  id?: number;
  nombre: string;
  fecha: string;
  total_facturas: number;
  monto_total: number;
  created_at?: string;
}

export interface Factura {
  id?: number;
  numero_factura: number;
  fecha: string;
  empresa: string;
  saldo_adeudado: number;
  persona_id: number;
  departamento?: string;
  dias_trabajados?: number;
  tarifa_diaria?: number;
  horas_extra?: number;
  monto_horas_extra?: number;
  detalle_departamentos?: DeptLineItem[];
  lote_id?: number;
  persona?: Persona;
  created_at?: string;
}

export interface InvoiceDraft {
  persona: Persona;
  departamentos: DeptLineItem[];
  empresa: string;
  fecha: string;
  numero_factura: number;
  saldo_adeudado: number;
}

export interface UltimaFacturaInfo {
  numero_factura: number;
  fecha: string;
  empresa: string;
  saldo_adeudado: number;
  departamento?: string;
}

// ─── tRPC fetch wrapper ─────────────────────────────────

async function trpcQuery<T>(procedure: string, input?: unknown): Promise<T> {
  const url = `/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(input ?? undefined))}`;
  const res = await fetch(url, { credentials: "include" });
  const json = await res.json();
  if (!res.ok || json?.error) {
    const msg = json?.error?.json?.message ?? json?.error?.message ?? `Error calling ${procedure}`;
    throw new Error(msg);
  }
  return json?.result?.data as T;
}

async function trpcMutate<T>(procedure: string, input?: unknown): Promise<T> {
  const res = await fetch(`/api/trpc/${procedure}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input ?? undefined),
  });
  const json = await res.json();
  if (!res.ok || json?.error) {
    const msg = json?.error?.json?.message ?? json?.error?.message ?? `Error calling ${procedure}`;
    throw new Error(msg);
  }
  return json?.result?.data as T;
}

// ─── Tarifas Globales ───────────────────────────────────

export async function obtenerTarifas(): Promise<TarifaDepartamento[]> {
  return trpcQuery<TarifaDepartamento[]>("tarifas.listDepartamento");
}

export async function actualizarTarifa(
  clave: string,
  tarifa_diaria: number,
  tarifa_hora_extra: number
): Promise<void> {
  await trpcMutate<void>("tarifas.updateDepartamento", { clave, tarifa_diaria, tarifa_hora_extra });
}

// ─── Tarifas Personalizadas por Persona ─────────────────

export async function obtenerTarifasPersona(personaId: number): Promise<TarifaPersona[]> {
  return trpcQuery<TarifaPersona[]>("tarifas.listPersona", { personaId });
}

export async function guardarTarifaPersona(
  personaId: number,
  departamentoClave: string,
  tarifaDiaria: number,
  tarifaHoraExtra: number
): Promise<void> {
  await trpcMutate<void>("tarifas.upsertPersona", {
    persona_id: personaId,
    departamento_clave: departamentoClave,
    tarifa_diaria: tarifaDiaria,
    tarifa_hora_extra: tarifaHoraExtra,
  });
}

export async function eliminarTarifaPersona(
  personaId: number,
  departamentoClave: string
): Promise<void> {
  await trpcMutate<void>("tarifas.deletePersona", {
    persona_id: personaId,
    departamento_clave: departamentoClave,
  });
}

// ─── Personas ────────────────────────────────────────────

export async function obtenerColaboradoresActivos(): Promise<Persona[]> {
  return trpcQuery<Persona[]>("personas.listActive");
}

export async function obtenerTodosColaboradores(): Promise<Persona[]> {
  return trpcQuery<Persona[]>("personas.listAll");
}

export async function toggleColaboradorActivo(personaId: number, activo: boolean): Promise<void> {
  await trpcMutate<void>("personas.toggleActivo", { id: personaId, activo });
}

export async function actualizarDepartamentoPrincipal(personaId: number, departamento: string): Promise<void> {
  await trpcMutate<void>("personas.updateDepartamento", { id: personaId, departamento });
}

export async function actualizarPersona(personaId: number, data: Partial<Persona>): Promise<void> {
  await trpcMutate<void>("personas.update", { id: personaId, data });
}

export async function buscarPersonas(query: string): Promise<Persona[]> {
  const q = query.trim();
  if (!q) return [];
  return trpcQuery<Persona[]>("personas.search", { query: q });
}

export async function crearPersona(persona: Omit<Persona, "id">): Promise<Persona> {
  return trpcMutate<Persona>("personas.create", persona);
}

// ─── Número consecutivo POR PERSONA ─────────────────────

export async function obtenerUltimaFacturaPersona(
  personaId: number
): Promise<UltimaFacturaInfo | null> {
  return trpcQuery<UltimaFacturaInfo | null>("facturas.lastForPersona", { personaId });
}

export async function obtenerSiguienteNumeroFacturaPersona(
  personaId: number
): Promise<number> {
  const ultima = await obtenerUltimaFacturaPersona(personaId);
  if (!ultima) return 1;
  return ultima.numero_factura + 1;
}

export async function obtenerSiguienteNumeroFactura(): Promise<number> {
  return trpcQuery<number>("facturas.nextNumberGlobal");
}

// ─── Lotes ───────────────────────────────────────────────

export async function crearLote(lote: Omit<Lote, "id" | "created_at">): Promise<Lote> {
  return trpcMutate<Lote>("lotes.create", lote);
}

export async function obtenerLotes(): Promise<Lote[]> {
  return trpcQuery<Lote[]>("lotes.list");
}

export async function obtenerFacturasPorLote(loteId: number): Promise<Factura[]> {
  return trpcQuery<Factura[]>("facturas.byLote", { loteId });
}

export async function eliminarLote(loteId: number): Promise<void> {
  await trpcMutate<void>("lotes.delete", { id: loteId });
}

// ─── Facturas ────────────────────────────────────────────

export async function guardarFacturasBatch(
  facturas: Array<{
    numero_factura: number;
    fecha: string;
    empresa: string;
    saldo_adeudado: number;
    persona_id: number;
    departamento: string;
    dias_trabajados: number;
    tarifa_diaria: number;
    horas_extra: number;
    monto_horas_extra: number;
    detalle_departamentos: DeptLineItem[];
    lote_id: number;
  }>
): Promise<{ duplicados: string[] }> {
  return trpcMutate<{ duplicados: string[] }>("facturas.saveBatch", { facturas });
}

export async function verificarFacturaDuplicada(
  personaId: number,
  numeroFactura: number
): Promise<{ existe: boolean; siguiente: number }> {
  return trpcQuery<{ existe: boolean; siguiente: number }>("facturas.checkDuplicate", {
    persona_id: personaId,
    numero_factura: numeroFactura,
  });
}

export async function obtenerFacturas(): Promise<Factura[]> {
  return trpcQuery<Factura[]>("facturas.list");
}

// ─── Helpers (pure client-side, unchanged) ──────────────

export function calcularTotalFactura(items: DeptLineItem[]): number {
  return items.reduce((sum, item) => sum + item.subtotal, 0);
}

export function mergeTarifas(
  globales: TarifaDepartamento[],
  personalizadas: TarifaPersona[]
): Map<string, { tarifa_diaria: number; tarifa_hora_extra: number }> {
  const map = new Map<string, { tarifa_diaria: number; tarifa_hora_extra: number }>();
  for (const g of globales) {
    map.set(g.clave, { tarifa_diaria: g.tarifa_diaria, tarifa_hora_extra: g.tarifa_hora_extra });
  }
  for (const p of personalizadas) {
    map.set(p.departamento_clave, {
      tarifa_diaria: p.tarifa_diaria,
      tarifa_hora_extra: p.tarifa_hora_extra,
    });
  }
  return map;
}

// ─── Bank Route Codes (ACH) ─────────────────────────────

const RUTAS_BANCO: Record<string, string> = {
  "banco general": "71",
  "bango general": "71",
  "general": "71",
  "banisi": "1614",
  "st. georges bank": "1494",
  "st georges bank": "1494",
  "st. george": "1494",
  "bac": "59",
  "bac international": "59",
  "banistmo": "65",
  "caja de ahorros": "37",
  "caja ahorros": "37",
  "global bank": "79",
  "globalbank": "79",
  "multibank": "52",
  "multi bank": "52",
  "scotiabank": "1332",
  "scotia bank": "1332",
  "metrobank": "1400",
  "metro bank": "1400",
  "credicorp bank": "1478",
  "credicorp": "1478",
  "banco nacional": "38",
  "banconal": "38",
  "towerbank": "1436",
  "tower bank": "1436",
  "mega bank": "1588",
  "megabank": "1588",
  "la hipotecaria": "1614",
  "hipotecaria": "1614",
  "banco delta": "1656",
  "banco aliado": "1494",
  "banco pichincha": "1700",
  "banco davivienda": "1700",
  "davivienda": "1700",
};

export function obtenerRutaBanco(nombreBanco: string): string {
  const key = nombreBanco.toLowerCase().trim();
  if (RUTAS_BANCO[key]) return RUTAS_BANCO[key];
  const sorted = Object.entries(RUTAS_BANCO).sort((a, b) => b[0].length - a[0].length);
  for (const [banco, ruta] of sorted) {
    if (key.includes(banco) || banco.includes(key)) return ruta;
  }
  return "0000";
}

export function obtenerTipoCuentaCodigo(tipoCuenta: string): string {
  const t = tipoCuenta.toLowerCase().trim();
  if (t.includes("corriente")) return "03";
  if (t.includes("ahorro")) return "04";
  return "04";
}

function sanitizeACH(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/Ñ/g, "N")
    .replace(/[\[\]().]/g, "")
    .toUpperCase();
}

export function generarTXTBancario(drafts: InvoiceDraft[]): string {
  const rows = drafts.map((d) => {
    const cedula = sanitizeACH(d.persona.cedula).replace(/-/g, "").substring(0, 15);
    const titular = sanitizeACH(d.persona.titular_cuenta || d.persona.nombre_completo).replace(/-/g, "").substring(0, 22);
    const rutaBanco = obtenerRutaBanco(d.persona.nombre_banco).padStart(4, "0");
    const cuenta = sanitizeACH(d.persona.cuenta_bancaria).replace(/-/g, "").substring(0, 17);
    const tipoCuenta = obtenerTipoCuentaCodigo(d.persona.tipo_cuenta);
    const monto = d.saldo_adeudado.toFixed(2);
    const tipoTrans = "C";
    const adenda = `REF*TXT**FACTURA N-${d.numero_factura}\\`;
    return `${cedula},${titular},${rutaBanco},${cuenta},${tipoCuenta},${monto},${tipoTrans},${adenda}`;
  });
  return rows.join("\n");
}

// ─── Excel Export ───────────────────────────────────────

export function generarExcelLote(
  drafts: InvoiceDraft[],
  _loteNombre: string,
  loteFecha: string
): void {
  import("xlsx").then((XLSX) => {
    const dateStr = loteFecha.replace(/-/g, "");
    const sheetName = dateStr;

    const headerRows = [
      ["Responsable del reporte: asistente taproom"],
      ["Email de responsable: info@casabruja.com"],
      [`EVENTUALES-${dateStr}`],
      [`Fecha de reporte: ${loteFecha.replace(/-/g, "/")}`],
      ["Comentarios: "],
      [],
      [
        "No.",
        "FECHA",
        "FACTURA No.",
        "RUC/CEDULA",
        "DV",
        "PROVEEDOR",
        "DESCRIPCION",
        "SIN ITBMS",
        "ITBMS",
        "VALOR TOTAL",
        "Cuenta de Banco",
        "Banco",
        "Titular",
      ],
    ];

    const DEPT_ABREV: Record<string, string> = {
      "taproom": "T",
      "cocina": "C",
      "distribucion": "D",
      "distribución": "D",
      "produccion": "P",
      "producción": "P",
      "eventos": "V",
    };

    function obtenerAbrevDepts(departamentos: { departamento: string }[]): string {
      const abrevs = departamentos.map((dep) => {
        const key = dep.departamento.toLowerCase().trim();
        if (DEPT_ABREV[key]) return DEPT_ABREV[key];
        for (const [nombre, abrev] of Object.entries(DEPT_ABREV)) {
          if (key.includes(nombre) || nombre.includes(key)) return abrev;
        }
        return dep.departamento.charAt(0).toUpperCase();
      });
      return abrevs.join(",");
    }

    const dataRows = drafts.map((d, idx) => {
      const deptCodes = obtenerAbrevDepts(d.departamentos);
      return [
        idx + 1,
        d.fecha,
        d.numero_factura,
        d.persona.cedula,
        d.persona.dv && d.persona.dv.trim() ? d.persona.dv.trim() : "-",
        d.persona.nombre_completo,
        `SP ${d.persona.nombre_completo}-${deptCodes}`,
        d.saldo_adeudado,
        "",
        d.saldo_adeudado,
        d.persona.cuenta_bancaria,
        d.persona.nombre_banco,
        d.persona.titular_cuenta || d.persona.nombre_completo,
      ];
    });

    const totalRow = [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      drafts.reduce((s, d) => s + d.saldo_adeudado, 0),
      "",
      "",
      "",
    ];

    const allRows = [...headerRows, ...dataRows, totalRow];
    const ws = XLSX.utils.aoa_to_sheet(allRows);

    ws["!cols"] = [
      { wch: 5 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 5 },
      { wch: 28 },
      { wch: 32 },
      { wch: 12 },
      { wch: 8 },
      { wch: 14 },
      { wch: 20 },
      { wch: 18 },
      { wch: 28 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `EVENTUALES${dateStr}.xlsx`);
  });
}

export function descargarTXT(contenido: string, nombreArchivo: string): void {
  const blob = new Blob([contenido], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nombreArchivo;
  link.click();
  URL.revokeObjectURL(url);
}

// ═════════════════════════════════════════════════════════════════════════
// Purchasing module: Órdenes de Compra + Fletes y Gastos
// Shared types + thin fetch helpers over the new tRPC routers.
// ═════════════════════════════════════════════════════════════════════════

export type PoStatus = "draft" | "ordered" | "received" | "approved";
export type PaymentStatus = "unpaid" | "partial" | "paid";
export type AllocationMethod =
  | "by_qty"
  | "by_weight"
  | "by_volume"
  | "by_value"
  | "fixed_manual";

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  supplier: string;
  supplierInvoiceNumber: string | null;
  date: string;
  expectedDate: string | null;
  receivedDate: string | null;
  status: PoStatus;
  currency: string | null;
  exchangeRate: number | null;
  notes: string | null;
  paymentTerms: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  amountPaid: number | null;
  paymentDate: string | null;
  paymentReference: string | null;
  localCurrency: string | null;
  totalCost: number | null;
  totalLandedCost: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PoItem {
  id: number;
  purchaseOrderId: number;
  productCode: string;
  productDescription: string | null;
  category: string | null;
  qty: number;
  unit: string | null;
  supplierQty: number | null;
  supplierUom: string | null;
  supplierLotNumber: string | null;
  baseCostPerUnit: number | null;
  baseTotalCost: number | null;
  allocatedExtraCosts: number | null;
  allocatedExtraCostPerUnit: number | null;
  extraCostBreakdown: string | null;
  landedTotalCost: number | null;
  landedCostPerUnit: number | null;
  landedCostLocal: number | null;
  landedCostPerUnitLocal: number | null;
  weightKg: number | null;
  volumeL: number | null;
}

export interface PoExtraCost {
  id: number;
  purchaseOrderId: number;
  costType: string;
  description: string | null;
  amount: number;
  allocationMethod: AllocationMethod;
  costInvoiceId: number | null;
  costInvoiceAllocationId: number | null;
  costInvoiceRef: string | null;
  allocationPercentage: number | null;
}

export interface PoAttachment {
  id: number;
  purchaseOrderId: number;
  fileUrl: string;
  fileName: string | null;
  documentType: string | null;
  uploadedAt: string;
}

export interface PurchaseOrderFull {
  po: PurchaseOrder;
  items: PoItem[];
  extraCosts: PoExtraCost[];
  attachments: PoAttachment[];
}

export interface CostInvoice {
  id: number;
  invoiceNumber: string;
  supplier: string;
  costType: string;
  date: string;
  totalAmount: number;
  currency: string | null;
  allocatedAmount: number;
  remainingAmount: number;
  pdfUrl: string | null;
  pdfFileName: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CostInvoiceAllocation {
  id: number;
  costInvoiceId: number;
  purchaseOrderId: number;
  percentage: number;
  allocatedAmount: number;
  sourceCurrency: string | null;
  targetCurrency: string | null;
  exchangeRate: number | null;
  convertedAmount: number | null;
  notes: string | null;
  poNumber?: string;
}

export interface CostInvoiceFull {
  invoice: CostInvoice;
  allocations: CostInvoiceAllocation[];
}

// ─── Purchase Orders ─────────────────────────────────────────────────────

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  return trpcQuery<PurchaseOrder[]>("purchaseOrders.list");
}

export async function getPurchaseOrder(id: number): Promise<PurchaseOrderFull | null> {
  return trpcQuery<PurchaseOrderFull | null>("purchaseOrders.get", { id });
}

export async function nextPoNumber(): Promise<string> {
  return trpcQuery<string>("purchaseOrders.nextNumber");
}

export interface CreatePoInput {
  poNumber: string;
  supplier: string;
  supplierInvoiceNumber?: string | null;
  date: string;
  expectedDate?: string | null;
  currency?: string;
  exchangeRate?: number;
  localCurrency?: string;
  paymentTerms?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: PaymentStatus;
  amountPaid?: number | null;
  paymentDate?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  items: Array<{
    productCode: string;
    productDescription?: string | null;
    category?: string | null;
    qty: number;
    unit?: string | null;
    supplierQty?: number | null;
    supplierUom?: string | null;
    supplierLotNumber?: string | null;
    baseCostPerUnit?: number;
    weightKg?: number | null;
    volumeL?: number | null;
  }>;
  extraCosts?: Array<{
    costType: string;
    description?: string | null;
    amount: number;
    allocationMethod?: AllocationMethod;
  }>;
}

export async function createPurchaseOrder(input: CreatePoInput): Promise<PurchaseOrder | null> {
  return trpcMutate<PurchaseOrder | null>("purchaseOrders.create", input);
}

export async function updatePurchaseOrder(input: Partial<CreatePoInput> & { id: number; status?: PoStatus }): Promise<PurchaseOrder | null> {
  return trpcMutate<PurchaseOrder | null>("purchaseOrders.update", input);
}

export async function deletePurchaseOrder(id: number): Promise<boolean> {
  return trpcMutate<boolean>("purchaseOrders.delete", { id });
}

export async function setPurchaseOrderStatus(
  id: number,
  status: PoStatus,
  receivedDate?: string | null,
): Promise<void> {
  await trpcMutate<{ ok: true }>("purchaseOrders.setStatus", { id, status, receivedDate });
}

export async function approvePurchaseOrder(id: number): Promise<void> {
  await trpcMutate<{ ok: true }>("purchaseOrders.approve", { id });
}

export async function recalcLandedCosts(id: number): Promise<void> {
  await trpcMutate<void>("purchaseOrders.recalcLanded", { id });
}

// ─── Cost Invoices (Fletes y Gastos) ──────────────────────────────────────

export async function listCostInvoices(): Promise<CostInvoice[]> {
  return trpcQuery<CostInvoice[]>("costInvoices.list");
}

export async function getCostInvoice(id: number): Promise<CostInvoiceFull | null> {
  return trpcQuery<CostInvoiceFull | null>("costInvoices.get", { id });
}

export async function createCostInvoice(input: {
  invoiceNumber: string;
  supplier: string;
  costType: string;
  date: string;
  totalAmount: number;
  currency?: string;
  pdfUrl?: string | null;
  pdfFileName?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}): Promise<CostInvoice | null> {
  return trpcMutate<CostInvoice | null>("costInvoices.create", input);
}

export async function updateCostInvoice(
  id: number,
  patch: Partial<{
    invoiceNumber: string;
    supplier: string;
    costType: string;
    date: string;
    totalAmount: number;
    currency: string;
    pdfUrl: string | null;
    pdfFileName: string | null;
    notes: string | null;
  }>,
): Promise<CostInvoice | null> {
  return trpcMutate<CostInvoice | null>("costInvoices.update", { id, ...patch });
}

export async function deleteCostInvoice(id: number): Promise<boolean> {
  return trpcMutate<boolean>("costInvoices.delete", { id });
}

export async function allocateCostInvoice(input: {
  costInvoiceId: number;
  purchaseOrderId: number;
  percentage?: number;
  amount?: number;
  notes?: string | null;
  exchangeRate?: number | null;
}): Promise<CostInvoiceAllocation | null> {
  return trpcMutate<CostInvoiceAllocation | null>("costInvoices.allocate", input);
}

export async function deallocateCostInvoice(allocationId: number): Promise<boolean> {
  return trpcMutate<boolean>("costInvoices.deallocate", { allocationId });
}

export async function costInvoiceAllocationsForPo(
  purchaseOrderId: number,
): Promise<(CostInvoiceAllocation & {
  invoiceNumber: string;
  supplier: string;
  costType: string;
  totalAmount: number;
  invoiceCurrency: string;
})[]> {
  return trpcQuery("costInvoices.allocationsForPo", { purchaseOrderId });
}

// ─── PO Attachments ──────────────────────────────────────────────────────

export async function listPoAttachments(purchaseOrderId: number): Promise<PoAttachment[]> {
  return trpcQuery<PoAttachment[]>("purchaseOrders.attachments.list", { purchaseOrderId });
}

export async function deletePoAttachment(id: number): Promise<void> {
  await trpcMutate<{ ok: true }>("purchaseOrders.attachments.delete", { id });
}

export async function isStorageConfigured(): Promise<boolean> {
  const r = await trpcQuery<{ configured: boolean }>("purchaseOrders.attachments.storageConfigured");
  return r?.configured ?? false;
}

/**
 * Read a File/Blob as base64 (no `data:...;base64,` prefix). Shared util
 * for both attachment uploads and AI PDF extraction — the server expects
 * raw base64 (no data-URL prefix) through tRPC.
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader returned non-string"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

// ─── AI PDF extraction ────────────────────────────────────────────────────

export interface ExtractedPo {
  supplier: string;
  invoiceNumber: string;
  date: string;
  currency: string;
  paymentTerms: string | null;
  totalAmount: number;
  items: Array<{
    productCode: string;
    productDescription: string;
    qty: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    lotNumber: string | null;
  }>;
  extraCosts: Array<{
    costType: string;
    description: string;
    amount: number;
  }>;
}

export interface ExtractedCostInvoice {
  invoiceNumber: string;
  supplier: string;
  date: string;
  totalAmount: number;
  currency: string;
  costType: string;
  notes: string | null;
}

export async function isPoExtractorConfigured(): Promise<boolean> {
  const r = await trpcQuery<{ configured: boolean }>("purchaseOrders.extractorConfigured");
  return r?.configured ?? false;
}

export async function extractPoFromPdf(file: File): Promise<ExtractedPo> {
  const dataBase64 = await fileToBase64(file);
  return trpcMutate<ExtractedPo>("purchaseOrders.extractInvoice", { dataBase64 });
}

export async function isCostInvoiceExtractorConfigured(): Promise<boolean> {
  const r = await trpcQuery<{ configured: boolean }>("costInvoices.extractorConfigured");
  return r?.configured ?? false;
}

export async function extractCostInvoiceFromPdf(file: File): Promise<ExtractedCostInvoice> {
  const dataBase64 = await fileToBase64(file);
  return trpcMutate<ExtractedCostInvoice>("costInvoices.extractInvoice", { dataBase64 });
}

// ─── Supplier Invoice Library ─────────────────────────────────────────────

export const INVOICE_CATEGORIES = [
  "brewing_raw_materials",
  "brewing_packaging",
  "brewing_equipment",
  "logistics",
  "taproom_food",
  "taproom_beverages",
  "taproom_supplies",
  "utilities",
  "services",
  "rent_facility",
  "other",
] as const;
export type InvoiceCategory = (typeof INVOICE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<InvoiceCategory, { es: string; group: "brewing" | "taproom" | "overhead" | "logistics" | "other" }> = {
  brewing_raw_materials: { es: "Materias primas",    group: "brewing" },
  brewing_packaging:     { es: "Empaque",             group: "brewing" },
  brewing_equipment:     { es: "Equipo / Mantenimiento", group: "brewing" },
  logistics:             { es: "Fletes y Aduanas",    group: "logistics" },
  taproom_food:          { es: "Taproom · Comida",    group: "taproom" },
  taproom_beverages:     { es: "Taproom · Bebidas",   group: "taproom" },
  taproom_supplies:      { es: "Taproom · Suministros", group: "taproom" },
  utilities:             { es: "Servicios públicos",  group: "overhead" },
  services:              { es: "Servicios profesionales", group: "overhead" },
  rent_facility:         { es: "Alquiler / Instalaciones", group: "overhead" },
  other:                 { es: "Otro",                group: "other" },
};

export interface CorrectionChatMessage {
  role: "user" | "assistant";
  text: string;
  at: string;
}

export interface SupplierInvoice {
  id: number;
  fileUrl: string;
  fileKey: string;
  originalFilename: string | null;
  storedFilename: string | null;
  supplier: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string | null;
  totalAmount: number | null;
  category: InvoiceCategory;
  categoryWasManual: boolean;
  briefDescription: string | null;
  extractedData: ExtractedPo | null;
  usedInPoId: number | null;
  usedInCostInvoiceId: number | null;
  notes: string | null;
  uploadedBy: string | null;
  correctionChat: CorrectionChatMessage[] | null;
  uploadedAt: string;
  updatedAt: string;
}

/**
 * Send a correction message to the AI. Returns the assistant's reply plus
 * the updated invoice (in case the AI applied a patch). The chat history
 * is persisted server-side so the next call has full context.
 */
export async function invoiceCorrectionChat(
  invoiceId: number,
  message: string,
): Promise<{
  assistantText: string;
  patchApplied: unknown;
  invoice: SupplierInvoice | null;
  chatHistory: CorrectionChatMessage[];
}> {
  return trpcMutate("invoiceLibrary.correctionChat", { invoiceId, message });
}

export async function isInvoiceLibraryReady(): Promise<{ configured: boolean; storage: boolean }> {
  const r = await trpcQuery<{ configured: boolean; storage: boolean }>(
    "invoiceLibrary.extractorConfigured",
  );
  return r ?? { configured: false, storage: false };
}

export async function listInvoiceLibrary(opts: {
  category?: InvoiceCategory;
  search?: string;
  unlinkedOnly?: boolean;
} = {}): Promise<SupplierInvoice[]> {
  return trpcQuery<SupplierInvoice[]>("invoiceLibrary.list", opts);
}

export async function invoiceLibraryCounts(): Promise<Record<string, number>> {
  return trpcQuery<Record<string, number>>("invoiceLibrary.counts");
}

export async function getInvoiceFromLibrary(id: number): Promise<SupplierInvoice | null> {
  return trpcQuery<SupplierInvoice | null>("invoiceLibrary.get", { id });
}

export async function uploadToInvoiceLibrary(
  file: File,
): Promise<{ invoice: SupplierInvoice | null; storageConfigured: boolean; extractorRan: boolean }> {
  const dataBase64 = await fileToBase64(file);
  return trpcMutate("invoiceLibrary.upload", {
    originalFilename: file.name,
    contentType: file.type || "application/pdf",
    dataBase64,
  });
}

export async function updateInvoiceInLibrary(
  id: number,
  patch: Partial<{
    supplier: string | null;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    currency: string;
    totalAmount: number;
    category: InvoiceCategory;
    briefDescription: string | null;
    notes: string | null;
  }>,
): Promise<SupplierInvoice | null> {
  return trpcMutate<SupplierInvoice | null>("invoiceLibrary.update", { id, ...patch });
}

export async function deleteInvoiceFromLibrary(id: number): Promise<void> {
  await trpcMutate<{ ok: true }>("invoiceLibrary.delete", { id });
}

/** Back-link a library invoice to a PO (used after Nueva OC creates a row
 *  from a picked invoice — pins the invoice so it can't be picked again
 *  unless the user explicitly shows "ya asignadas"). */
export async function linkInvoiceToPo(invoiceId: number, poId: number | null): Promise<void> {
  await trpcMutate<{ ok: true }>("invoiceLibrary.linkToPo", { invoiceId, poId });
}

export async function linkInvoiceToCostInvoice(invoiceId: number, costInvoiceId: number | null): Promise<void> {
  await trpcMutate<{ ok: true }>("invoiceLibrary.linkToCostInvoice", { invoiceId, costInvoiceId });
}

/**
 * Read a File/Blob as base64 (no `data:...;base64,` prefix) in the browser
 * and push it through the tRPC upload procedure. Returns the newly
 * created attachment row — `fileUrl` is empty when server storage isn't
 * configured, which the caller should surface to the user.
 */
export async function uploadPoAttachment(
  purchaseOrderId: number,
  file: File,
  documentType?: string,
): Promise<{ attachment: PoAttachment | null; storageConfigured: boolean }> {
  const dataBase64 = await fileToBase64(file);
  return trpcMutate<{ attachment: PoAttachment | null; storageConfigured: boolean }>(
    "purchaseOrders.attachments.upload",
    {
      purchaseOrderId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      dataBase64,
      documentType: documentType ?? null,
    },
  );
}
