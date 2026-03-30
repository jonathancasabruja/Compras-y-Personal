/**
 * PagosColaboradores — Batch payment module
 * Auto-loads all active eventuales with their personalized rates.
 * Each eventual row shows department, days worked, extra hours, and calculated total.
 * Generates invoices for all eventuales in one batch.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  obtenerColaboradoresActivos,
  obtenerTarifas,
  obtenerTarifasPersona,
  obtenerUltimaFacturaPersona,
  type Persona,
  type TarifaDepartamento,
  type TarifaPersona,
  type InvoiceDraft,
  type DeptLineItem,
} from '@/lib/supabase';
import {
  Loader2,
  Users,
  FileText,
  Calculator,
  CheckCircle2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

interface ColabPaymentRow {
  persona: Persona;
  included: boolean;
  departamentos: {
    clave: string;
    nombre: string;
    selected: boolean;
    dias: number;
    horasExtra: number;
    tarifaDiaria: number;
    tarifaHoraExtra: number;
  }[];
  numeroFactura: number;
  total: number;
}

interface Props {
  onGenerateInvoices: (drafts: InvoiceDraft[], batchName: string, empresa: string) => void;
  refreshKey?: number;
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PagosColaboradores({ onGenerateInvoices, refreshKey }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ColabPaymentRow[]>([]);
  const [tarifas, setTarifas] = useState<TarifaDepartamento[]>([]);
  const [batchName, setBatchName] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [colaboradores, tarifasData] = await Promise.all([
        obtenerColaboradoresActivos(),
        obtenerTarifas(),
      ]);
      setTarifas(tarifasData);

      // Load personalized rates and last invoice for each collaborator
      const rowsData: ColabPaymentRow[] = await Promise.all(
        colaboradores.map(async (persona) => {
          let personalRates: TarifaPersona[] = [];
          let nextInvoiceNum = 1;
          try {
            if (persona.id) {
              personalRates = await obtenerTarifasPersona(persona.id);
              const lastInvoice = await obtenerUltimaFacturaPersona(persona.id);
              if (lastInvoice) {
                nextInvoiceNum = lastInvoice.numero_factura + 1;
              }
            }
          } catch {
            // use defaults
          }

          const departamentos = tarifasData.map((t) => {
            const personalRate = personalRates.find((pr) => pr.departamento_clave === t.clave);
            return {
              clave: t.clave,
              nombre: t.nombre,
              selected: persona.departamento_principal === t.clave,
              dias: 0,
              horasExtra: 0,
              tarifaDiaria: personalRate?.tarifa_diaria ?? t.tarifa_diaria,
              tarifaHoraExtra: personalRate?.tarifa_hora_extra ?? t.tarifa_hora_extra,
            };
          });

          return {
            persona,
            included: true,
            departamentos,
            numeroFactura: nextInvoiceNum,
            total: 0,
          };
        })
      );

      setRows(rowsData);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar eventuales');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  function updateRow(index: number, updater: (row: ColabPaymentRow) => ColabPaymentRow) {
    setRows((prev) => {
      const next = [...prev];
      const updated = updater(next[index]);
      // Recalculate total
      let total = 0;
      for (const d of updated.departamentos) {
        if (d.selected) {
          total += d.dias * d.tarifaDiaria + d.horasExtra * d.tarifaHoraExtra;
        }
      }
      updated.total = total;
      next[index] = updated;
      return next;
    });
  }

  function toggleDept(rowIdx: number, deptIdx: number) {
    updateRow(rowIdx, (row) => {
      const deps = [...row.departamentos];
      deps[deptIdx] = { ...deps[deptIdx], selected: !deps[deptIdx].selected };
      return { ...row, departamentos: deps };
    });
  }

  function setDeptDias(rowIdx: number, deptIdx: number, dias: number) {
    updateRow(rowIdx, (row) => {
      const deps = [...row.departamentos];
      deps[deptIdx] = { ...deps[deptIdx], dias };
      return { ...row, departamentos: deps };
    });
  }

  function setDeptHorasExtra(rowIdx: number, deptIdx: number, horas: number) {
    updateRow(rowIdx, (row) => {
      const deps = [...row.departamentos];
      deps[deptIdx] = { ...deps[deptIdx], horasExtra: horas };
      return { ...row, departamentos: deps };
    });
  }

  function toggleIncluded(rowIdx: number) {
    setRows((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], included: !next[rowIdx].included };
      return next;
    });
  }

  function handleGenerate() {
    if (!batchName.trim()) {
      toast.error('Ingrese un nombre para el lote');
      return;
    }
    if (!empresa) {
      toast.error('Seleccione una empresa');
      return;
    }

    const includedRows = rows.filter((r) => r.included && r.total > 0);
    if (includedRows.length === 0) {
      toast.error('No hay eventuales con montos para facturar');
      return;
    }

    const drafts: InvoiceDraft[] = includedRows.map((row) => {
      const selectedDepts = row.departamentos.filter((d) => d.selected && d.dias > 0);
      const departamentos: DeptLineItem[] = selectedDepts.map((d) => ({
        departamento: d.nombre.toUpperCase(),
        clave: d.clave,
        dias: d.dias,
        tarifa_diaria: d.tarifaDiaria,
        horas_extra: d.horasExtra,
        tarifa_hora_extra: d.tarifaHoraExtra,
        subtotal: d.dias * d.tarifaDiaria + d.horasExtra * d.tarifaHoraExtra,
      }));

      return {
        persona: row.persona,
        departamentos,
        empresa,
        fecha,
        numero_factura: row.numeroFactura,
        saldo_adeudado: row.total,
      };
    });

    onGenerateInvoices(drafts, batchName, empresa);
  }

  const includedRows = rows.filter((r) => r.included);
  const totalMonto = includedRows.reduce((s, r) => s + r.total, 0);
  const totalFacturas = includedRows.filter((r) => r.total > 0).length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin mb-3" style={{ color: '#1B4965' }} />
        <p className="text-sm" style={{ color: '#6b7280' }}>Cargando eventuales activos...</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-16">
        <Users className="w-12 h-12 mx-auto mb-3" style={{ color: '#d1d5db' }} />
        <p className="text-sm font-medium" style={{ color: '#6b7280' }}>No hay eventuales activos</p>
        <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
          Active eventuales en la pestaña "Eventuales" para verlos aquí
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Batch info header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs mb-1.5">Nombre del Lote</Label>
          <Input
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder="Ej: Semana 14 - Abril"
            className="h-9 text-sm bg-white"
          />
        </div>
        <div>
          <Label className="text-xs mb-1.5">Empresa</Label>
          <Select value={empresa} onValueChange={setEmpresa}>
            <SelectTrigger className="h-9 text-sm bg-white">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Casa Bruja, S.A.">Casa Bruja, S.A.</SelectItem>
              <SelectItem value="Lost Origin, S.A.">Lost Origin, S.A.</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1.5">Fecha</Label>
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-9 text-sm bg-white"
          />
        </div>
      </div>

      {/* Collaborator rows */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6b7280' }}>
            Eventuales Activos ({rows.length})
          </p>
        </div>

        {rows.map((row, rowIdx) => {
          const selectedDepts = row.departamentos.filter((d) => d.selected);
          return (
            <div
              key={row.persona.id}
              className="border rounded-lg overflow-hidden transition-all"
              style={{
                borderColor: row.included ? '#d1fae5' : '#e5e7eb',
                opacity: row.included ? 1 : 0.5,
              }}
            >
              {/* Person header */}
              <div
                className="flex items-center gap-3 px-3 py-2.5"
                style={{ backgroundColor: row.included ? '#f0fdf4' : '#f9fafb' }}
              >
                <Checkbox
                  checked={row.included}
                  onCheckedChange={() => toggleIncluded(rowIdx)}
                  className="flex-shrink-0"
                />
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}
                >
                  {row.persona.nombre_completo.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#111827' }}>
                    {row.persona.nombre_completo}
                  </p>
                  <p className="text-[11px] font-mono" style={{ color: '#6b7280' }}>
                    {row.persona.cedula} · Fact #{row.numeroFactura}
                  </p>
                </div>
                {row.total > 0 && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span
                      className="text-sm font-bold font-mono"
                      style={{ color: '#1B4965' }}
                    >
                      ${fmt(row.total)}
                    </span>
                  </div>
                )}
              </div>

              {/* Department selection */}
              {row.included && (
                <div className="px-3 py-2 space-y-1.5" style={{ borderTop: '1px solid #e5e7eb' }}>
                  {row.departamentos.map((dept, deptIdx) => (
                    <div key={dept.clave} className="flex items-center gap-2">
                      <Checkbox
                        checked={dept.selected}
                        onCheckedChange={() => toggleDept(rowIdx, deptIdx)}
                        className="flex-shrink-0"
                      />
                      <span
                        className="text-xs font-medium w-24 flex-shrink-0 truncate"
                        style={{ color: dept.selected ? '#111827' : '#9ca3af' }}
                      >
                        {dept.nombre}
                      </span>
                      {dept.selected && (
                        <>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px]" style={{ color: '#9ca3af' }}>Días:</span>
                            <Input
                              type="number"
                              min={0}
                              value={dept.dias || ''}
                              onChange={(e) => setDeptDias(rowIdx, deptIdx, parseInt(e.target.value) || 0)}
                              className="h-7 w-14 text-xs text-center bg-white px-1"
                            />
                          </div>
                          <span className="text-[10px] font-mono" style={{ color: '#9ca3af' }}>
                            ×${fmt(dept.tarifaDiaria)}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px]" style={{ color: '#9ca3af' }}>H.E:</span>
                            <Input
                              type="number"
                              min={0}
                              value={dept.horasExtra || ''}
                              onChange={(e) => setDeptHorasExtra(rowIdx, deptIdx, parseInt(e.target.value) || 0)}
                              className="h-7 w-14 text-xs text-center bg-white px-1"
                            />
                          </div>
                          <span className="text-[10px] font-mono" style={{ color: '#9ca3af' }}>
                            ×${fmt(dept.tarifaHoraExtra)}
                          </span>
                          {dept.dias > 0 && (
                            <span className="text-xs font-semibold font-mono ml-auto" style={{ color: '#1B4965' }}>
                              ${fmt(dept.dias * dept.tarifaDiaria + dept.horasExtra * dept.tarifaHoraExtra)}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Totals bar */}
      <div
        className="sticky bottom-0 p-4 rounded-lg border"
        style={{
          backgroundColor: '#f8fafc',
          borderColor: '#1B4965',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: '#6b7280' }}>Total Facturas</p>
              <p className="text-lg font-bold font-mono" style={{ color: '#1B4965' }}>{totalFacturas}</p>
            </div>
            <div style={{ width: '1px', height: '32px', backgroundColor: '#e5e7eb' }} />
            <div>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: '#6b7280' }}>Monto Total</p>
              <p className="text-lg font-bold font-mono" style={{ color: '#1B4965' }}>${fmt(totalMonto)}</p>
            </div>
          </div>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={totalFacturas === 0 || !batchName.trim() || !empresa}
          className="w-full h-10 text-sm font-semibold gap-2"
          style={{ backgroundColor: '#1B4965' }}
        >
          <FileText className="w-4 h-4" />
          Generar {totalFacturas} Factura{totalFacturas !== 1 ? 's' : ''} — ${fmt(totalMonto)}
        </Button>
      </div>
    </div>
  );
}
