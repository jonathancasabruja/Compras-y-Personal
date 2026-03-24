/**
 * InvoiceForm Component
 * =====================
 * Design: Corporate Precision
 * Multi-department selection with days worked and extra hours
 * Rates: TAPROOM $30, COCINA $25, DISTRIBUCIÓN $25, PRODUCCIÓN $25, EVENTO $35
 * Extra hours: $5/hr
 */

import { useState, useEffect } from 'react';
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
  obtenerSiguienteNumeroFactura,
  DEPARTAMENTOS,
  TARIFA_HORA_EXTRA,
  calcularTotalDepartamento,
  type DepartamentoKey,
  type DepartamentoEntry,
} from '@/lib/supabase';
import { Calculator, Clock } from 'lucide-react';

export interface InvoiceFormData {
  numero_factura: number;
  fecha: string;
  empresa: string;
  departamentos: DepartamentoEntry[];
}

interface InvoiceFormProps {
  onChange: (data: InvoiceFormData) => void;
  data: InvoiceFormData;
}

const deptKeys = Object.keys(DEPARTAMENTOS) as DepartamentoKey[];

export default function InvoiceForm({ onChange, data }: InvoiceFormProps) {
  const [isLoadingNumber, setIsLoadingNumber] = useState(false);

  useEffect(() => {
    loadNextInvoiceNumber();
  }, []);

  const loadNextInvoiceNumber = async () => {
    setIsLoadingNumber(true);
    try {
      const nextNum = await obtenerSiguienteNumeroFactura();
      onChange({ ...data, numero_factura: nextNum });
    } catch (err) {
      console.error('Error loading invoice number:', err);
    } finally {
      setIsLoadingNumber(false);
    }
  };

  const handleFieldChange = (field: 'numero_factura' | 'fecha' | 'empresa', value: string | number) => {
    onChange({ ...data, [field]: value });
  };

  const toggleDepartamento = (key: DepartamentoKey) => {
    const existing = data.departamentos.find((d) => d.key === key);
    if (existing) {
      onChange({
        ...data,
        departamentos: data.departamentos.filter((d) => d.key !== key),
      });
    } else {
      onChange({
        ...data,
        departamentos: [...data.departamentos, { key, dias: 0, horasExtra: 0 }],
      });
    }
  };

  const updateDepartamento = (key: DepartamentoKey, field: 'dias' | 'horasExtra', value: number) => {
    onChange({
      ...data,
      departamentos: data.departamentos.map((d) =>
        d.key === key ? { ...d, [field]: value } : d
      ),
    });
  };

  const isDeptSelected = (key: DepartamentoKey) => data.departamentos.some((d) => d.key === key);

  const getDeptEntry = (key: DepartamentoKey) => data.departamentos.find((d) => d.key === key);

  // Calculate grand total across all selected departments
  const grandTotal = data.departamentos.reduce(
    (sum, entry) => sum + calcularTotalDepartamento(entry),
    0
  );

  return (
    <div className="space-y-4">
      {/* Invoice number and date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="numero_factura" className="text-xs mb-1.5">
            N° Factura Inicial
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono-numbers">
              #
            </span>
            <Input
              id="numero_factura"
              type="number"
              value={data.numero_factura || ''}
              onChange={(e) => handleFieldChange('numero_factura', parseInt(e.target.value) || 0)}
              className="h-10 text-sm bg-white pl-7 font-mono-numbers"
              disabled={isLoadingNumber}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Auto-consecutivo (se asigna uno por factura)
          </p>
        </div>
        <div>
          <Label htmlFor="fecha" className="text-xs mb-1.5">
            Fecha
          </Label>
          <Input
            id="fecha"
            type="date"
            value={data.fecha || new Date().toISOString().split('T')[0]}
            onChange={(e) => handleFieldChange('fecha', e.target.value)}
            className="h-10 text-sm bg-white font-mono-numbers"
          />
        </div>
      </div>

      {/* Company */}
      <div>
        <Label htmlFor="empresa" className="text-xs mb-1.5">
          Empresa a Cobrar
        </Label>
        <Select
          value={data.empresa}
          onValueChange={(val) => handleFieldChange('empresa', val)}
        >
          <SelectTrigger className="h-10 text-sm bg-white">
            <SelectValue placeholder="Seleccionar empresa..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CASA BRUJA, S.A.">Casa Bruja, S.A.</SelectItem>
            <SelectItem value="LOST ORIGIN, S.A.">Lost Origin, S.A.</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Department Selection */}
      <div>
        <Label className="text-xs mb-2 block">
          Departamentos <span className="text-muted-foreground font-normal">(seleccione uno o varios)</span>
        </Label>
        <div className="space-y-2">
          {deptKeys.map((key) => {
            const dept = DEPARTAMENTOS[key];
            const selected = isDeptSelected(key);
            const entry = getDeptEntry(key);
            const subtotal = entry ? calcularTotalDepartamento(entry) : 0;

            return (
              <div
                key={key}
                className={`rounded-lg border transition-all ${
                  selected
                    ? 'border-primary/40 bg-primary/[0.03]'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                {/* Checkbox row */}
                <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => toggleDepartamento(key)}
                  />
                  <span className="text-sm font-medium text-foreground flex-1">
                    {dept.label}
                  </span>
                  <span className="text-xs font-mono-numbers text-muted-foreground bg-gray-100 px-2 py-0.5 rounded">
                    ${dept.tarifa}/día
                  </span>
                </label>

                {/* Expanded fields when selected */}
                {selected && entry && (
                  <div className="px-3 pb-3 pt-0">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground mb-1 block">
                          Días trabajados
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          value={entry.dias || ''}
                          onChange={(e) =>
                            updateDepartamento(key, 'dias', parseInt(e.target.value) || 0)
                          }
                          placeholder="0"
                          className="h-8 text-xs bg-white font-mono-numbers"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          Horas extra
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          value={entry.horasExtra || ''}
                          onChange={(e) =>
                            updateDepartamento(key, 'horasExtra', parseInt(e.target.value) || 0)
                          }
                          placeholder="0"
                          className="h-8 text-xs bg-white font-mono-numbers"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                          <Calculator className="w-2.5 h-2.5" />
                          Subtotal
                        </Label>
                        <div className="h-8 flex items-center text-xs font-mono-numbers font-semibold text-foreground bg-gray-50 rounded-md px-2 border border-gray-200">
                          ${subtotal.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    {entry.dias > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        {entry.dias} día{entry.dias !== 1 ? 's' : ''} × ${dept.tarifa} = ${(entry.dias * dept.tarifa).toFixed(2)}
                        {entry.horasExtra > 0 && (
                          <> + {entry.horasExtra} hr{entry.horasExtra !== 1 ? 's' : ''} extra × ${TARIFA_HORA_EXTRA} = ${(entry.horasExtra * TARIFA_HORA_EXTRA).toFixed(2)}</>
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

      {/* Grand Total */}
      {data.departamentos.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-gray-900 text-white rounded-lg">
          <span className="text-sm font-medium">
            Total General ({data.departamentos.length} factura{data.departamentos.length !== 1 ? 's' : ''})
          </span>
          <span className="text-lg font-bold font-mono-numbers">
            ${grandTotal.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
