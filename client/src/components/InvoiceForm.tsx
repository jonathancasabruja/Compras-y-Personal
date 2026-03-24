/**
 * InvoiceForm Component
 * =====================
 * Multi-department selection with days worked and extra hours.
 * Rates loaded from Supabase tarifas_departamento table.
 * Produces a SINGLE invoice per person summing all departments.
 */

import { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  obtenerTarifas,
  type TarifaDepartamento,
  type DeptLineItem,
} from '@/lib/supabase';
import { Calculator, Clock, Loader2 } from 'lucide-react';

export interface InvoiceFormData {
  fecha: string;
  empresa: string;
  departamentos: DeptLineItem[];
  totalCalculado: number;
}

interface InvoiceFormProps {
  onChange: (data: InvoiceFormData) => void;
  data: InvoiceFormData;
  tarifas: TarifaDepartamento[];
}

export default function InvoiceForm({ onChange, data, tarifas }: InvoiceFormProps) {
  const toggleDepartamento = (tarifa: TarifaDepartamento) => {
    const existing = data.departamentos.find((d) => d.clave === tarifa.clave);
    if (existing) {
      const newDepts = data.departamentos.filter((d) => d.clave !== tarifa.clave);
      const total = calcTotal(newDepts);
      onChange({ ...data, departamentos: newDepts, totalCalculado: total });
    } else {
      const newItem: DeptLineItem = {
        departamento: tarifa.nombre.toUpperCase(),
        clave: tarifa.clave,
        dias: 0,
        tarifa_diaria: tarifa.tarifa_diaria,
        horas_extra: 0,
        tarifa_hora_extra: tarifa.tarifa_hora_extra,
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

  const handleFieldChange = (field: 'fecha' | 'empresa', value: string) => {
    onChange({ ...data, [field]: value });
  };

  const isDeptSelected = (clave: string) => data.departamentos.some((d) => d.clave === clave);
  const getDeptEntry = (clave: string) => data.departamentos.find((d) => d.clave === clave);

  return (
    <div className="space-y-4">
      {/* Date and Company */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="fecha" className="text-xs mb-1.5">Fecha</Label>
          <Input
            id="fecha"
            type="date"
            value={data.fecha}
            onChange={(e) => handleFieldChange('fecha', e.target.value)}
            className="h-10 text-sm bg-white font-mono"
          />
        </div>
        <div>
          <Label htmlFor="empresa" className="text-xs mb-1.5">Empresa a Cobrar</Label>
          <Select value={data.empresa} onValueChange={(val) => handleFieldChange('empresa', val)}>
            <SelectTrigger className="h-10 text-sm bg-white">
              <SelectValue placeholder="Seleccionar empresa..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASA BRUJA, S.A.">Casa Bruja, S.A.</SelectItem>
              <SelectItem value="LOST ORIGIN, S.A.">Lost Origin, S.A.</SelectItem>
            </SelectContent>
          </Select>
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
                  <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}>
                    ${tarifa.tarifa_diaria}/día
                  </span>
                </label>

                {selected && entry && (
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
