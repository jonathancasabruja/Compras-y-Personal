/**
 * InvoicePreview Component
 * ========================
 * Replicates the exact invoice template from JEANROLDAN.docx
 * Uses explicit hex/rgb colors for print compatibility
 * Now supports department info, days worked, extra hours
 * Fits on exactly 1 printed page
 */

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Persona } from '@/lib/supabase';

interface InvoicePreviewProps {
  persona: Persona;
  factura: {
    numero_factura: number;
    fecha: string;
    empresa: string;
    saldo_adeudado: number;
    departamento?: string;
    dias_trabajados?: number;
    tarifa_diaria?: number;
    horas_extra?: number;
    monto_horas_extra?: number;
  };
}

export default function InvoicePreview({ persona, factura }: InvoicePreviewProps) {
  const formatCurrency = (amount: number) => {
    return `USD ${amount.toFixed(2)}`;
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr + 'T12:00:00');
      return format(date, 'dd/MM/yyyy', { locale: es });
    } catch {
      return dateStr;
    }
  };

  const montoDias = (factura.dias_trabajados || 0) * (factura.tarifa_diaria || 0);
  const montoExtras = factura.monto_horas_extra || 0;
  const total = factura.saldo_adeudado;

  // Build line items for the table
  const lineItems: { desc: string; qty: number; rate: number; amount: number }[] = [];

  if (factura.dias_trabajados && factura.tarifa_diaria) {
    lineItems.push({
      desc: `SERVICIOS PROFESIONALES - ${factura.departamento || 'GENERAL'}`,
      qty: factura.dias_trabajados,
      rate: factura.tarifa_diaria,
      amount: montoDias,
    });
  }

  if (factura.horas_extra && factura.horas_extra > 0) {
    lineItems.push({
      desc: 'HORAS EXTRA',
      qty: factura.horas_extra,
      rate: 5,
      amount: montoExtras,
    });
  }

  // Fallback: if no line items (e.g. old invoices), show single line
  if (lineItems.length === 0) {
    lineItems.push({
      desc: 'SERVICIOS PROFESIONALES',
      qty: 1,
      rate: total,
      amount: total,
    });
  }

  return (
    <div
      id="invoice-content"
      className="invoice-preview"
      style={{
        fontFamily: "'DM Sans', system-ui, sans-serif",
        padding: '28px 36px',
        height: '270mm',
        boxSizing: 'border-box',
        backgroundColor: '#ffffff',
        color: '#1a1a1a',
        width: '100%',
        maxWidth: '210mm',
        margin: '0 auto',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)',
        border: '1px solid #e5e5e5',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header: Name/ID left, FACTURA right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h2
            style={{
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '0.02em',
              color: '#111111',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            {persona.nombre_completo}
          </h2>
          <p
            style={{
              fontSize: '12px',
              color: '#666666',
              fontFamily: "'JetBrains Mono', monospace",
              margin: '2px 0 0 0',
            }}
          >
            {persona.cedula}{persona.dv ? ` DV${persona.dv}` : ''}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h1
            style={{
              fontSize: '32px',
              fontWeight: 300,
              letterSpacing: '0.15em',
              color: '#aaaaaa',
              lineHeight: 1,
              margin: 0,
            }}
          >
            FACTURA
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: '#888888',
              fontFamily: "'JetBrains Mono', monospace",
              margin: '4px 0 0 0',
            }}
          >
            # {factura.numero_factura}
          </p>
        </div>
      </div>

      {/* Billing info and date/amount */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <p style={{ fontSize: '11px', color: '#888888', margin: '0 0 4px 0' }}>Cobrar a:</p>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#111111', margin: 0 }}>
            {factura.empresa}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '6px', borderBottom: '1px solid #d0d0d0', paddingBottom: '2px' }}>
            <span style={{ fontSize: '11px', color: '#888888' }}>Fecha:</span>
            <span style={{ fontSize: '12px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatDate(factura.fecha)}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              padding: '6px 12px',
              marginTop: '4px',
              backgroundColor: '#f3f3f3',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#444444' }}>Saldo Adeudado:</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div style={{ marginBottom: '24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#333333' }}>
              <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#ffffff', padding: '8px 12px', width: '45%' }}>
                Artículo
              </th>
              <th style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: '#ffffff', padding: '8px 12px', width: '15%' }}>
                Cantidad
              </th>
              <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, color: '#ffffff', padding: '8px 12px', width: '20%' }}>
                Tasa
              </th>
              <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, color: '#ffffff', padding: '8px 12px', width: '20%' }}>
                Monto
              </th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '10px 12px', fontSize: '12px', color: '#222222', fontWeight: 600 }}>
                  {item.desc}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '12px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>
                  {item.qty}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatCurrency(item.rate)}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatCurrency(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '32px' }}>
        <div style={{ width: '220px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '11px', color: '#888888' }}>Subtotal:</span>
            <span style={{ fontSize: '12px', color: '#222222', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(total)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '11px', color: '#888888' }}>Impuesto (0%):</span>
            <span style={{ fontSize: '12px', color: '#222222', fontFamily: "'JetBrains Mono', monospace" }}>
              USD 0.00
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#111111' }}>Total:</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      </div>

      {/* Spacer to push notes to bottom */}
      <div style={{ flex: 1 }} />

      {/* Notes / Bank Info + Department */}
      <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '16px' }}>
        <p style={{ fontSize: '11px', color: '#888888', margin: '0 0 6px 0' }}>Notas:</p>
        <div style={{ fontSize: '12px', color: '#444444' }}>
          {factura.departamento && (
            <p style={{ margin: '0 0 6px 0', fontWeight: 600, color: '#222222' }}>
              Departamento: {factura.departamento}
            </p>
          )}
          <p style={{ margin: '0 0 2px 0' }}>{persona.nombre_banco}</p>
          <p style={{ margin: '0 0 2px 0' }}>Cuenta de {persona.tipo_cuenta}</p>
          <p style={{ margin: '0 0 2px 0', fontFamily: "'JetBrains Mono', monospace" }}>{persona.cuenta_bancaria}</p>
          {persona.titular_cuenta && persona.titular_cuenta !== persona.nombre_completo && (
            <p style={{ fontSize: '11px', color: '#888888', margin: '4px 0 0 0' }}>
              Titular: {persona.titular_cuenta}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
