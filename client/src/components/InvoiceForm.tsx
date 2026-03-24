/**
 * InvoiceForm Component
 * =====================
 * - Multi-department selection with days worked and extra hours
 * - Rates loaded from merged global + per-person tarifas
 * - Shows personalized rate badge when different from global
 * - Editable invoice number (auto-populated from last per-person invoice)
 * - Shows last invoice info for the selected person
 */

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  obtenerTarifasPersona,
  obtenerUltimaFacturaPersona,
  obtenerSiguienteNumeroFacturaPersona,
  guardarTarifaPersona,
  mergeTarifas,
  type TarifaDepartamento,
  type TarifaPersona,
  type DeptLineItem,
  type Persona,
  type UltimaFacturaInfo,
} from '@/lib/supabase';
import { Calculator, Clock, Loader2, FileText, Edit3, Save, X } from 'lucide-react';
import { toast } from 'sonner';

export interface InvoiceFormData {
  fecha: string;
  empresa: string;
  departamentos: DeptLineItem[];
  totalCalculado: number;
  numeroFactura: number;
}

interface InvoiceFormProps {
  onChange: (data: InvoiceFormData) => void;
  data: InvoiceFormData;
  tarifas: TarifaDepartamento[];
  persona: Persona;
}

export default function InvoiceForm({ onChange, data, tarifas, persona }: InvoiceFormProps) {
  const [ultimaFactura, setUltimaFactura] = useState<UltimaFacturaInfo | null>(null);
  const [tarifasPersona, setTarifasPersona] = useState<TarifaPersona[]>([]);
  const [mergedRates, setMergedRates] = useState<Map<string, { tarifa_diaria: number; tarifa_hora_extra: number }>>(new Map());
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [editRateValues, setEditRateValues] = useState({ tarifa_diaria: 0, tarifa_hora_extra: 0 });
  const [savingRate, setSavingRate] = useState(false);

  // Load per-person data when persona changes
  useEffect(() => {
    if (!persona.id) return;
    let cancelled = false;
    setLoadingInfo(true);

    (async () => {
      try {
        const [ultima, tp] = await Promise.all([
          obtenerUltimaFacturaPersona(persona.id!),
          obtenerTarifasPersona(persona.id!),
        ]);
        if (cancelled) return;

        setUltimaFactura(ultima);
        setTarifasPersona(tp);

        const merged = mergeTarifas(tarifas, tp);
        setMergedRates(merged);

        // Auto-set next invoice number for this person
        const nextNum = ultima ? ultima.numero_factura + 1 : 1;
        if (data.numeroFactura === 0 || data.numeroFactura === 1) {
          onChange({ ...data, numeroFactura: nextNum });
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoadingInfo(false);
      }
    })();

    return () => { cancelled = true; };
  }, [persona.id, tarifas]);

  const getRate = (clave: string) => {
    return mergedRates.get(clave) || { tarifa_diaria: 0, tarifa_hora_extra: 5 };
  };

  const getGlobalRate = (clave: string) => {
    const t = tarifas.find((t) => t.clave === clave);
    return t ? { tarifa_diaria: t.tarifa_diaria, tarifa_hora_extra: t.tarifa_hora_extra } : null;
  };

  const isPersonalized = (clave: string) => {
    return tarifasPersona.some((tp) => tp.departamento_clave === clave);
  };

  const toggleDepartamento = (tarifa: TarifaDepartamento) => {
    const existing = data.departamentos.find((d) => d.clave === tarifa.clave);
    if (existing) {
      const newDepts = data.departamentos.filter((d) => d.clave !== tarifa.clave);
      const total = calcTotal(newDepts);
      onChange({ ...data, departamentos: newDepts, totalCalculado: total });
    } else {
      const rate = getRate(tarifa.clave);
      const newItem: DeptLineItem = {
        departamento: tarifa.nombre.toUpperCase(),
        clave: tarifa.clave,
        dias: 0,
        tarifa_diaria: rate.tarifa_diaria,
        horas_extra: 0,
        tarifa_hora_extra: rate.tarifa_hora_extra,
        subtotal: 0,
      };
      const newDepts = [...data.departamentos, newItem];
      onChange({ ...data, departamentos: newDepts, totalCalculado: calcTotal(newDepts) });
    }
  };

  const updateDeptField = (clave: string, field: 'dias' | 'horas_extra', value: number) => {
    const newDepts = data.departamentos.map((d) => {
      if (d.clave !== clave) return d;
      const updated = { ...d, [field]: value };
      updated.subtotal = updated.dias * updated.tarifa_diaria + updated.horas_extra * updated.tarifa_hora_extra;
      return updated;
    });
    const total = calcTotal(newDepts);
    onChange({ ...data, departamentos: newDepts, totalCalculado: total });
  };

  const handleNumeroChange = (value: number) => {
    onChange({ ...data, numeroFactura: value });
  };

  // ─── Save personalized rate ───────────────────────────
  const handleStartEditRate = (clave: string) => {
    const rate = getRate(clave);
    setEditRateValues({ tarifa_diaria: rate.tarifa_diaria, tarifa_hora_extra: rate.tarifa_hora_extra });
    setEditingRate(clave);
  };

  const handleSaveRate = async (clave: string) => {
    if (!persona.id) return;
    setSavingRate(true);
    try {
      await guardarTarifaPersona(persona.id, clave, editRateValues.tarifa_diaria, editRateValues.tarifa_hora_extra);
      // Reload personalized rates
      const tp = await obtenerTarifasPersona(persona.id);
      setTarifasPersona(tp);
      const merged = mergeTarifas(tarifas, tp);
      setMergedRates(merged);

      // Update any already-selected department with the new rate
      const newDepts = data.departamentos.map((d) => {
        if (d.clave !== clave) return d;
        const updated = { ...d, tarifa_diaria: editRateValues.tarifa_diaria, tarifa_hora_extra: editRateValues.tarifa_hora_extra };
        updated.subtotal = updated.dias * updated.tarifa_diaria + updated.horas_extra * updated.tarifa_hora_extra;
        return updated;
      });
      onChange({ ...data, departamentos: newDepts, totalCalculado: calcTotal(newDepts) });

      toast.success(`Tarifa personalizada guardada para ${persona.nombre_completo}`);
      setEditingRate(null);
    } catch (err: any) {
      toast.error('Error al guardar tarifa: ' + (err?.message || ''));
    } finally {
      setSavingRate(false);
    }
  };

  const isDeptSelected = (clave: string) => data.departamentos.some((d) => d.clave === clave);
  const getDeptEntry = (clave: string) => data.departamentos.find((d) => d.clave === clave);

  if (loadingInfo) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#1B4965' }} />
        <span className="ml-2 text-sm" style={{ color: '#6b7280' }}>Cargando datos de {persona.nombre_completo}...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Last invoice info */}
      {ultimaFactura && (
        <div className="p-3 rounded-lg border" style={{ backgroundColor: '#fefce8', borderColor: '#fde68a' }}>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-3.5 h-3.5" style={{ color: '#d97706' }} />
            <span className="text-xs font-semibold" style={{ color: '#92400e' }}>Última Factura</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs" style={{ color: '#78350f' }}>
            <div>
              <span className="block" style={{ color: '#a16207', fontSize: '10px' }}>N° Factura</span>
              <span className="font-mono font-bold">#{ultimaFactura.numero_factura}</span>
            </div>
            <div>
              <span className="block" style={{ color: '#a16207', fontSize: '10px' }}>Fecha</span>
              <span className="font-mono">{ultimaFactura.fecha}</span>
            </div>
            <div>
              <span className="block" style={{ color: '#a16207', fontSize: '10px' }}>Empresa</span>
              <span>{ultimaFactura.empresa}</span>
            </div>
            <div>
              <span className="block" style={{ color: '#a16207', fontSize: '10px' }}>Monto</span>
              <span className="font-mono font-bold">${ultimaFactura.saldo_adeudado.toFixed(2)}</span>
            </div>
          </div>
          {ultimaFactura.departamento && (
            <p className="text-[10px] mt-1" style={{ color: '#a16207' }}>Dept: {ultimaFactura.departamento}</p>
          )}
        </div>
      )}

      {/* Invoice number (editable) */}
      <div>
        <Label className="text-xs mb-1.5">N° de Factura</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="1"
            value={data.numeroFactura || ''}
            onChange={(e) => handleNumeroChange(parseInt(e.target.value) || 0)}
            className="h-10 text-sm bg-white font-mono w-32"
          />
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>
            {ultimaFactura
              ? `Siguiente sugerido: #${ultimaFactura.numero_factura + 1}`
              : 'Primera factura de esta persona'}
          </span>
        </div>
      </div>

      {/* Department Selection */}
      <div>
        <Label className="text-xs mb-2 block">
          Departamentos <span className="text-gray-400 font-normal">(seleccione uno o varios)</span>
        </Label>
        <div className="space-y-2">
          {tarifas.map((tarifa) => {
            const selected = isDeptSelected(tarifa.clave);
            const entry = getDeptEntry(tarifa.clave);
            const rate = getRate(tarifa.clave);
            const personalized = isPersonalized(tarifa.clave);
            const globalRate = getGlobalRate(tarifa.clave);
            const isEditing = editingRate === tarifa.clave;

            return (
              <div
                key={tarifa.clave}
                className={`rounded-lg border transition-all ${
                  selected ? 'border-[#1B4965]/40 bg-[#1B4965]/[0.03]' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                  <Checkbox checked={selected} onCheckedChange={() => toggleDepartamento(tarifa)} />
                  <span className="text-sm font-medium flex-1" style={{ color: '#1a1a1a' }}>
                    {tarifa.nombre}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {personalized && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>
                        PERSONALIZADO
                      </span>
                    )}
                    <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}>
                      ${rate.tarifa_diaria}/día
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleStartEditRate(tarifa.clave); }}
                      className="p-1 rounded hover:bg-gray-100 transition-colors"
                      title="Editar tarifa para esta persona"
                    >
                      <Edit3 className="w-3 h-3" style={{ color: '#9ca3af' }} />
                    </button>
                  </div>
                </label>

                {/* Inline rate editor */}
                {isEditing && (
                  <div className="px-3 pb-3 pt-1">
                    <div className="p-2.5 rounded-md border" style={{ backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }}>
                      <p className="text-[10px] font-medium mb-2" style={{ color: '#0369a1' }}>
                        Tarifa personalizada para {persona.nombre_completo} en {tarifa.nombre}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] mb-1 block" style={{ color: '#0369a1' }}>$/Día</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editRateValues.tarifa_diaria}
                            onChange={(e) => setEditRateValues((v) => ({ ...v, tarifa_diaria: parseFloat(e.target.value) || 0 }))}
                            className="h-7 text-xs bg-white font-mono"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] mb-1 block" style={{ color: '#0369a1' }}>$/Hora Extra</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editRateValues.tarifa_hora_extra}
                            onChange={(e) => setEditRateValues((v) => ({ ...v, tarifa_hora_extra: parseFloat(e.target.value) || 0 }))}
                            className="h-7 text-xs bg-white font-mono"
                          />
                        </div>
                      </div>
                      {globalRate && (
                        <p className="text-[9px] mt-1.5" style={{ color: '#6b7280' }}>
                          Tarifa global: ${globalRate.tarifa_diaria}/día, ${globalRate.tarifa_hora_extra}/hr extra
                        </p>
                      )}
                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveRate(tarifa.clave)}
                          disabled={savingRate}
                          className="h-6 text-[10px] px-2 gap-1"
                          style={{ backgroundColor: '#1B4965' }}
                        >
                          {savingRate ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Save className="w-2.5 h-2.5" />}
                          Guardar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingRate(null)}
                          className="h-6 text-[10px] px-2 gap-1"
                        >
                          <X className="w-2.5 h-2.5" /> Cancelar
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {selected && entry && !isEditing && (
                  <div className="px-3 pb-3 pt-0">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] mb-1 block" style={{ color: '#9ca3af' }}>Días trabajados</Label>
                        <Input
                          type="number"
                          min="0"
                          value={entry.dias || ''}
                          onChange={(e) => updateDeptField(tarifa.clave, 'dias', parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="h-8 text-xs bg-white font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] mb-1 flex items-center gap-1" style={{ color: '#9ca3af' }}>
                          <Clock className="w-2.5 h-2.5" /> Horas extra
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          value={entry.horas_extra || ''}
                          onChange={(e) => updateDeptField(tarifa.clave, 'horas_extra', parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="h-8 text-xs bg-white font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] mb-1 flex items-center gap-1" style={{ color: '#9ca3af' }}>
                          <Calculator className="w-2.5 h-2.5" /> Subtotal
                        </Label>
                        <div className="h-8 flex items-center text-xs font-mono font-semibold rounded-md px-2 border" style={{ backgroundColor: '#f9fafb', borderColor: '#e5e7eb', color: '#1a1a1a' }}>
                          ${entry.subtotal.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    {entry.dias > 0 && (
                      <p className="text-[10px] mt-1.5" style={{ color: '#9ca3af' }}>
                        {entry.dias} día{entry.dias !== 1 ? 's' : ''} × ${entry.tarifa_diaria} = ${(entry.dias * entry.tarifa_diaria).toFixed(2)}
                        {entry.horas_extra > 0 && (
                          <> + {entry.horas_extra} hr{entry.horas_extra !== 1 ? 's' : ''} extra × ${entry.tarifa_hora_extra} = ${(entry.horas_extra * entry.tarifa_hora_extra).toFixed(2)}</>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Total */}
      {data.departamentos.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: '#1B4965', color: '#ffffff' }}>
          <span className="text-sm font-medium">Total Factura</span>
          <span className="text-lg font-bold font-mono">${data.totalCalculado.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

function calcTotal(items: DeptLineItem[]): number {
  return items.reduce((sum, d) => sum + d.subtotal, 0);
}
