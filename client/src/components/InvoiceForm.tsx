/**
 * InvoiceForm Component
 * =====================
 * Design: Corporate Precision - Minimal form for invoice data
 * Fields: Invoice number (auto), date, company, amount
 */

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { obtenerSiguienteNumeroFactura } from '@/lib/supabase';

interface InvoiceFormData {
  numero_factura: number;
  fecha: string;
  empresa: string;
  saldo_adeudado: number;
}

interface InvoiceFormProps {
  onChange: (data: InvoiceFormData) => void;
  data: InvoiceFormData;
}

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

  const handleChange = (field: keyof InvoiceFormData, value: string | number) => {
    onChange({ ...data, [field]: value });
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="numero_factura" className="text-xs mb-1.5">
            N° Factura
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono-numbers">
              #
            </span>
            <Input
              id="numero_factura"
              type="number"
              value={data.numero_factura || ''}
              onChange={(e) => handleChange('numero_factura', parseInt(e.target.value) || 0)}
              className="h-10 text-sm bg-white pl-7 font-mono-numbers"
              disabled={isLoadingNumber}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Auto-consecutivo
          </p>
        </div>
        <div>
          <Label htmlFor="fecha" className="text-xs mb-1.5">
            Fecha
          </Label>
          <Input
            id="fecha"
            type="date"
            value={data.fecha || today}
            onChange={(e) => handleChange('fecha', e.target.value)}
            className="h-10 text-sm bg-white font-mono-numbers"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="empresa" className="text-xs mb-1.5">
          Empresa a Cobrar
        </Label>
        <Select
          value={data.empresa}
          onValueChange={(val) => handleChange('empresa', val)}
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

      <div>
        <Label htmlFor="saldo_adeudado" className="text-xs mb-1.5">
          Saldo Adeudado (USD)
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono-numbers">
            $
          </span>
          <Input
            id="saldo_adeudado"
            type="number"
            step="0.01"
            min="0"
            value={data.saldo_adeudado || ''}
            onChange={(e) => handleChange('saldo_adeudado', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            className="h-10 text-sm bg-white pl-7 font-mono-numbers"
          />
        </div>
      </div>
    </div>
  );
}
