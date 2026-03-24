import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mcuxvoyrhfwafoxvxinm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jdXh2b3lyaGZ3YWZveHZ4aW5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDgxOTgsImV4cCI6MjA4OTA4NDE5OH0.eYhxZvhDLE6Ej034WYzy-wObCLbOW42qqdRgVn8K8vQ';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Types
export interface Persona {
  id?: number;
  nombre_completo: string;
  cedula: string;
  dv: string;
  cuenta_bancaria: string;
  nombre_banco: string;
  tipo_cuenta: 'Ahorros' | 'Corriente';
  titular_cuenta: string;
  created_at?: string;
  updated_at?: string;
}

export interface Factura {
  id?: number;
  numero_factura: number;
  fecha: string;
  empresa: string;
  saldo_adeudado: number;
  persona_id: number;
  created_at?: string;
  // Joined data
  persona?: Persona;
}

// API functions
export async function buscarPersonas(query: string): Promise<Persona[]> {
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .or(`nombre_completo.ilike.%${query}%,cedula.ilike.%${query}%`)
    .order('nombre_completo')
    .limit(10);

  if (error) throw error;
  return data || [];
}

export async function obtenerPersonaPorId(id: number): Promise<Persona | null> {
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function crearPersona(persona: Omit<Persona, 'id' | 'created_at' | 'updated_at'>): Promise<Persona> {
  const { data, error } = await supabase
    .from('personas')
    .insert(persona)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function actualizarPersona(id: number, persona: Partial<Persona>): Promise<Persona> {
  const { data, error } = await supabase
    .from('personas')
    .update({ ...persona, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

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

export async function crearFactura(factura: Omit<Factura, 'id' | 'created_at' | 'persona'>): Promise<Factura> {
  const { data, error } = await supabase
    .from('facturas')
    .insert(factura)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function obtenerFacturas(): Promise<Factura[]> {
  const { data, error } = await supabase
    .from('facturas')
    .select('*, persona:personas(*)')
    .order('numero_factura', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function obtenerFacturaPorId(id: number): Promise<Factura | null> {
  const { data, error } = await supabase
    .from('facturas')
    .select('*, persona:personas(*)')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function obtenerTodasPersonas(): Promise<Persona[]> {
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .order('nombre_completo');

  if (error) throw error;
  return data || [];
}
