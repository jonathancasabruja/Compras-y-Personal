/**
 * Supabase Client & Data Layer
 * =============================
 * - Personas: CRUD + search
 * - Tarifas globales: read/update department rates from DB
 * - Tarifas personalizadas: per-person per-department overrides
 * - Facturas: single invoice per person (multiple dept lines stored as JSON)
 * - Lotes: batch grouping with custom name
 * - Invoice numbering: per-person consecutive (editable)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mcuxvoyrhfwafoxvxinm.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jdXh2b3lyaGZ3YWZveHZ4aW5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDgxOTgsImV4cCI6MjA4OTA4NDE5OH0.eYhxZvhDLE6Ej034WYzy-wObCLbOW42qqdRgVn8K8vQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

/** A single department line item within an invoice */
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

/** Data for a single invoice being prepared in the UI */
export interface InvoiceDraft {
  persona: Persona;
  departamentos: DeptLineItem[];
  empresa: string;
  fecha: string;
  numero_factura: number;
  saldo_adeudado: number;
}

/** Summary of a person's last invoice */
export interface UltimaFacturaInfo {
  numero_factura: number;
  fecha: string;
  empresa: string;
  saldo_adeudado: number;
  departamento?: string;
}

// ─── Tarifas Globales ───────────────────────────────────

export async function obtenerTarifas(): Promise<TarifaDepartamento[]> {
  const { data, error } = await supabase
    .from('tarifas_departamento')
    .select('*')
    .order('id');
  if (error) throw error;
  return data || [];
}

export async function actualizarTarifa(
  clave: string,
  tarifa_diaria: number,
  tarifa_hora_extra: number
): Promise<void> {
  const { error } = await supabase
    .from('tarifas_departamento')
    .update({ tarifa_diaria, tarifa_hora_extra, updated_at: new Date().toISOString() })
    .eq('clave', clave);
  if (error) throw error;
}

// ─── Tarifas Personalizadas por Persona ─────────────────

export async function obtenerTarifasPersona(personaId: number): Promise<TarifaPersona[]> {
  const { data, error } = await supabase
    .from('tarifas_persona')
    .select('*')
    .eq('persona_id', personaId);
  if (error) throw error;
  return data || [];
}

export async function guardarTarifaPersona(
  personaId: number,
  departamentoClave: string,
  tarifaDiaria: number,
  tarifaHoraExtra: number
): Promise<void> {
  const { error } = await supabase
    .from('tarifas_persona')
    .upsert(
      {
        persona_id: personaId,
        departamento_clave: departamentoClave,
        tarifa_diaria: tarifaDiaria,
        tarifa_hora_extra: tarifaHoraExtra,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'persona_id,departamento_clave' }
    );
  if (error) throw error;
}

export async function eliminarTarifaPersona(
  personaId: number,
  departamentoClave: string
): Promise<void> {
  const { error } = await supabase
    .from('tarifas_persona')
    .delete()
    .eq('persona_id', personaId)
    .eq('departamento_clave', departamentoClave);
  if (error) throw error;
}

// ─── Personas ────────────────────────────────────────────

export async function obtenerColaboradoresActivos(): Promise<Persona[]> {
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .eq('activo', true)
    .order('nombre_completo');
  if (error) throw error;
  return data || [];
}

export async function obtenerTodosColaboradores(): Promise<Persona[]> {
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .order('activo', { ascending: false })
    .order('nombre_completo');
  if (error) throw error;
  return data || [];
}

export async function toggleColaboradorActivo(personaId: number, activo: boolean): Promise<void> {
  const { error } = await supabase
    .from('personas')
    .update({ activo })
    .eq('id', personaId);
  if (error) throw error;
}

export async function actualizarDepartamentoPrincipal(personaId: number, departamento: string): Promise<void> {
  const { error } = await supabase
    .from('personas')
    .update({ departamento_principal: departamento })
    .eq('id', personaId);
  if (error) throw error;
}

export async function actualizarPersona(personaId: number, data: Partial<Persona>): Promise<void> {
  const { error } = await supabase
    .from('personas')
    .update(data)
    .eq('id', personaId);
  if (error) throw error;
}

export async function buscarPersonas(query: string): Promise<Persona[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .or(`nombre_completo.ilike.%${q}%,cedula.ilike.%${q}%`)
    .order('nombre_completo')
    .limit(10);
  if (error) throw error;
  return data || [];
}

export async function crearPersona(persona: Omit<Persona, 'id'>): Promise<Persona> {
  const { data, error } = await supabase
    .from('personas')
    .insert(persona)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Número consecutivo POR PERSONA ─────────────────────

export async function obtenerUltimaFacturaPersona(
  personaId: number
): Promise<UltimaFacturaInfo | null> {
  const { data, error } = await supabase
    .from('facturas')
    .select('numero_factura, fecha, empresa, saldo_adeudado, departamento')
    .eq('persona_id', personaId)
    .order('numero_factura', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0];
}

export async function obtenerSiguienteNumeroFacturaPersona(
  personaId: number
): Promise<number> {
  const ultima = await obtenerUltimaFacturaPersona(personaId);
  if (!ultima) return 1;
  return ultima.numero_factura + 1;
}

/** Global next number (fallback for new persons with no invoices) */
export async function obtenerSiguienteNumeroFactura(): Promise<number> {
  const { data, error } = await supabase
    .from('facturas')
    .select('numero_factura')
    .order('numero_factura', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return 1;
  return data[0].numero_factura + 1;
}

// ─── Lotes ───────────────────────────────────────────────

export async function crearLote(lote: Omit<Lote, 'id' | 'created_at'>): Promise<Lote> {
  const { data, error } = await supabase
    .from('lotes_facturas')
    .insert({
      nombre: lote.nombre,
      fecha: lote.fecha,
      total_facturas: lote.total_facturas,
      monto_total: lote.monto_total,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function obtenerLotes(): Promise<Lote[]> {
  const { data, error } = await supabase
    .from('lotes_facturas')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function obtenerFacturasPorLote(loteId: number): Promise<Factura[]> {
  const { data, error } = await supabase
    .from('facturas')
    .select('*, persona:personas(*)')
    .eq('lote_id', loteId)
    .order('numero_factura');
  if (error) throw error;
  return data || [];
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
  // Try batch insert first
  const { error } = await supabase.from('facturas').insert(facturas);
  if (error) {
    // If unique constraint error (persona_id + numero_factura), insert one by one
    if (error.message?.includes('duplicate') || error.code === '23505') {
      const failed: string[] = [];
      for (const f of facturas) {
        const { error: singleErr } = await supabase.from('facturas').insert(f);
        if (singleErr) {
          // Find persona name for better message
          const { data: p } = await supabase.from('personas').select('nombre_completo').eq('id', f.persona_id).single();
          const nombre = p?.nombre_completo || `ID ${f.persona_id}`;
          failed.push(`#${f.numero_factura} (${nombre})`);
        }
      }
      return { duplicados: failed };
    }
    throw error;
  }
  return { duplicados: [] };
}

/**
 * Check if a specific invoice number already exists for a given persona.
 * Returns the next available number if duplicate found.
 */
export async function verificarFacturaDuplicada(
  personaId: number,
  numeroFactura: number
): Promise<{ existe: boolean; siguiente: number }> {
  const { data } = await supabase
    .from('facturas')
    .select('numero_factura')
    .eq('persona_id', personaId)
    .eq('numero_factura', numeroFactura);
  const existe = (data && data.length > 0) || false;

  // Get the max invoice number for this persona to suggest next
  const { data: maxData } = await supabase
    .from('facturas')
    .select('numero_factura')
    .eq('persona_id', personaId)
    .order('numero_factura', { ascending: false })
    .limit(1);
  const maxNum = maxData && maxData.length > 0 ? maxData[0].numero_factura : 0;
  return { existe, siguiente: maxNum + 1 };
}

export async function obtenerFacturas(): Promise<Factura[]> {
  const { data, error } = await supabase
    .from('facturas')
    .select('*, persona:personas(*)')
    .order('numero_factura', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

// ─── Helpers ─────────────────────────────────────────────

export function calcularTotalFactura(items: DeptLineItem[]): number {
  return items.reduce((sum, item) => sum + item.subtotal, 0);
}

/**
 * Merge global tarifas with per-person overrides.
 * Returns a map: departamento_clave → { tarifa_diaria, tarifa_hora_extra }
 */
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
  'banco general': '71',
  'bango general': '71',
  'general': '71',
  'banisi': '1614',
  'st. georges bank': '1494',
  'st georges bank': '1494',
  'st. george': '1494',
  'bac': '59',
  'bac international': '59',
  'banistmo': '65',
  'caja de ahorros': '37',
  'caja ahorros': '37',
  'global bank': '79',
  'globalbank': '79',
  'multibank': '52',
  'multi bank': '52',
  'scotiabank': '1332',
  'scotia bank': '1332',
  'metrobank': '1400',
  'metro bank': '1400',
  'credicorp bank': '1478',
  'credicorp': '1478',
  'banco nacional': '38',
  'banconal': '38',
  'towerbank': '1436',
  'tower bank': '1436',
  'mega bank': '1588',
  'megabank': '1588',
  'la hipotecaria': '1614',
  'hipotecaria': '1614',
  'banco delta': '1656',
  'banco aliado': '1494',
  'banco pichincha': '1700',
  'banco davivienda': '1700',
  'davivienda': '1700',
};

export function obtenerRutaBanco(nombreBanco: string): string {
  const key = nombreBanco.toLowerCase().trim();
  // Exact match first
  if (RUTAS_BANCO[key]) return RUTAS_BANCO[key];
  // Then partial match, sorted by key length descending to match most specific first
  const sorted = Object.entries(RUTAS_BANCO).sort((a, b) => b[0].length - a[0].length);
  for (const [banco, ruta] of sorted) {
    if (key.includes(banco) || banco.includes(key)) return ruta;
  }
  return '0000'; // Unknown bank
}

export function obtenerTipoCuentaCodigo(tipoCuenta: string): string {
  const t = tipoCuenta.toLowerCase().trim();
  if (t.includes('corriente')) return '03';
  if (t.includes('ahorro')) return '04';
  return '04'; // Default to savings
}

/** Sanitize text for ACH format: remove tildes, ñ, and invalid characters */
function sanitizeACH(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics (tildes)
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .replace(/[\[\]().]/g, '') // Remove brackets, parentheses, dots
    .toUpperCase();
}

/** Generate TXT content in ACH bank transfer format (semicolon separated, no header) */
export function generarTXTBancario(drafts: InvoiceDraft[]): string {
  const rows = drafts.map((d) => {
    const cedula = sanitizeACH(d.persona.cedula).replace(/-/g, '').substring(0, 15);
    const titular = sanitizeACH(d.persona.titular_cuenta || d.persona.nombre_completo).replace(/-/g, '').substring(0, 22);
    const rutaBanco = obtenerRutaBanco(d.persona.nombre_banco).padStart(4, '0');
    const cuenta = sanitizeACH(d.persona.cuenta_bancaria).replace(/-/g, '').substring(0, 17);
    const tipoCuenta = obtenerTipoCuentaCodigo(d.persona.tipo_cuenta);
    const monto = d.saldo_adeudado.toFixed(2);
    const tipoTrans = 'D';
    const adenda = `REF*TXT**FACTURA N-${d.numero_factura}\\`;
    return `${cedula},${titular},${rutaBanco},${cuenta},${tipoCuenta},${monto},${tipoTrans},${adenda}`;
  });
  return rows.join('\n');
}

// ─── Eliminar Lote ──────────────────────────────────────

export async function eliminarLote(loteId: number): Promise<void> {
  // First delete all invoices in this lote
  const { error: errFacturas } = await supabase
    .from('facturas')
    .delete()
    .eq('lote_id', loteId);
  if (errFacturas) throw errFacturas;
  // Then delete the lote itself
  const { error: errLote } = await supabase
    .from('lotes_facturas')
    .delete()
    .eq('id', loteId);
  if (errLote) throw errLote;
}

// ─── Excel Export ───────────────────────────────────────

export function generarExcelLote(
  drafts: InvoiceDraft[],
  loteNombre: string,
  loteFecha: string
): void {
  import('xlsx').then((XLSX) => {
    const dateStr = loteFecha.replace(/-/g, '');
    const sheetName = dateStr;

    // Header rows
    const headerRows = [
      ['Responsable del reporte: asistente taproom'],
      ['Email de responsable: info@casabruja.com'],
      [`EVENTUALES-${dateStr}`],
      [`Fecha de reporte: ${loteFecha.replace(/-/g, '/')}`],
      ['Comentarios: '],
      [], // empty row
      [
        'No.',
        'FECHA',
        'FACTURA No.',
        'RUC/CEDULA',
        'DV',
        'PROVEEDOR',
        'DESCRIPCION',
        'SIN ITBMS',
        'ITBMS',
        'VALOR TOTAL',
        'Cuenta de Banco',
        'Banco',
        'Titular',
      ],
    ];

    // Data rows
    const dataRows = drafts.map((d, idx) => [
      idx + 1,
      d.fecha,
      d.numero_factura,
      d.persona.cedula,
      d.persona.dv && d.persona.dv.trim() ? d.persona.dv.trim() : '-',
      d.persona.nombre_completo,
      `SP ${d.persona.nombre_completo}`,
      d.saldo_adeudado,
      '', // ITBMS empty
      d.saldo_adeudado,
      d.persona.cuenta_bancaria,
      d.persona.nombre_banco,
      d.persona.titular_cuenta || d.persona.nombre_completo,
    ]);

    // Total row
    const totalRow = [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      drafts.reduce((s, d) => s + d.saldo_adeudado, 0),
      '',
      '',
      '',
    ];

    const allRows = [...headerRows, ...dataRows, totalRow];
    const ws = XLSX.utils.aoa_to_sheet(allRows);

    // Set column widths
    ws['!cols'] = [
      { wch: 5 },  // No.
      { wch: 12 }, // FECHA
      { wch: 12 }, // FACTURA No.
      { wch: 15 }, // RUC/CEDULA
      { wch: 5 },  // DV
      { wch: 28 }, // PROVEEDOR
      { wch: 32 }, // DESCRIPCION
      { wch: 12 }, // SIN ITBMS
      { wch: 8 },  // ITBMS
      { wch: 14 }, // VALOR TOTAL
      { wch: 20 }, // Cuenta de Banco
      { wch: 18 }, // Banco
      { wch: 28 }, // Titular
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `EVENTUALES${dateStr}.xlsx`);
  });
}

/** Download TXT as file */
export function descargarTXT(contenido: string, nombreArchivo: string): void {
  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nombreArchivo;
  link.click();
  URL.revokeObjectURL(url);
}
