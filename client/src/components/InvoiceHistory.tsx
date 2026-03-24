/**
 * InvoiceHistory Component
 * ========================
 * Design: Corporate Precision - Clean table of past invoices
 * Now shows department info
 */

import { useState, useEffect } from 'react';
import { obtenerFacturas, type Factura } from '@/lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InvoiceHistoryProps {
  onViewInvoice: (factura: Factura) => void;
  refreshTrigger: number;
}

export default function InvoiceHistory({ onViewInvoice, refreshTrigger }: InvoiceHistoryProps) {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadFacturas();
  }, [refreshTrigger]);

  const loadFacturas = async () => {
    setIsLoading(true);
    try {
      const data = await obtenerFacturas();
      setFacturas(data);
    } catch (err) {
      console.error('Error loading invoices:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr + 'T12:00:00');
      return format(date, 'dd/MM/yyyy', { locale: es });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (facturas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <FileText className="w-5 h-5 text-gray-400" />
        </div>
        <p className="text-sm text-muted-foreground">No hay facturas registradas</p>
        <p className="text-xs text-muted-foreground mt-1">
          Las facturas creadas aparecerán aquí
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-3">
              N°
            </th>
            <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-3">
              Persona
            </th>
            <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-3">
              Empresa
            </th>
            <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-3">
              Depto.
            </th>
            <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-3">
              Fecha
            </th>
            <th className="text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-3">
              Monto
            </th>
            <th className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-3">
              Ver
            </th>
          </tr>
        </thead>
        <tbody>
          {facturas.map((factura) => (
            <tr
              key={factura.id}
              className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
            >
              <td className="py-2.5 px-3 text-sm font-mono-numbers font-medium text-foreground">
                #{factura.numero_factura}
              </td>
              <td className="py-2.5 px-3">
                <p className="text-sm text-foreground truncate max-w-[140px]">
                  {factura.persona?.nombre_completo || '—'}
                </p>
              </td>
              <td className="py-2.5 px-3">
                <span className="text-xs text-muted-foreground">
                  {factura.empresa}
                </span>
              </td>
              <td className="py-2.5 px-3">
                <span className="text-xs text-muted-foreground">
                  {factura.departamento || '—'}
                </span>
              </td>
              <td className="py-2.5 px-3 text-xs text-muted-foreground font-mono-numbers">
                {formatDate(factura.fecha)}
              </td>
              <td className="py-2.5 px-3 text-right text-sm font-mono-numbers font-medium text-foreground">
                ${Number(factura.saldo_adeudado).toFixed(2)}
              </td>
              <td className="py-2.5 px-3 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewInvoice(factura)}
                  className="h-7 w-7 p-0"
                >
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
