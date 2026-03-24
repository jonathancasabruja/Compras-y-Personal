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
): Promise<void> {
  const { error } = await supabase.from('facturas').insert(facturas);
  if (error) throw error;
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
