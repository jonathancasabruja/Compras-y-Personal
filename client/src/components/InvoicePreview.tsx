/**
 * InvoicePreview Component
 * ========================
 * Replicates the exact invoice template from JEANROLDAN.docx
 * Uses explicit hex/rgb colors to ensure html2canvas compatibility
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

  return (
    <div
      id="invoice-content"
      className="invoice-preview"
      style={{
        fontFamily: "'DM Sans', system-ui, sans-serif",
        padding: '40px 48px',
        minHeight: '297mm',
        boxSizing: 'border-box',
        backgroundColor: '#ffffff',
        color: '#1a1a1a',
        width: '100%',
        maxWidth: '210mm',
        margin: '0 auto',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)',
        border: '1px solid #e5e5e5',
      }}
    >
      {/* Header: Name/ID left, FACTURA right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '48px' }}>
        <div>
          <h2
            style={{
              fontSize: '15px',
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
              fontSize: '13px',
              color: '#666666',
              marginTop: '2px',
              fontFamily: "'JetBrains Mono', monospace",
              margin: '2px 0 0 0',
            }}
          >
            {persona.cedula} DV{persona.dv}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h1
            style={{
              fontSize: '36px',
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
              fontSize: '14px',
              color: '#888888',
              marginTop: '4px',
              fontFamily: "'JetBrains Mono', monospace",
              margin: '4px 0 0 0',
            }}
          >
            # {factura.numero_factura}
          </p>
        </div>
      </div>

      {/* Billing info and date/amount */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '48px' }}>
        <div>
          <p style={{ fontSize: '12px', color: '#888888', marginBottom: '4px', margin: '0 0 4px 0' }}>Cobrar a:</p>
          <p style={{ fontSize: '14px', fontWeight: 700, color: '#111111', margin: 0 }}>
            {factura.empresa}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px', marginBottom: '8px', borderBottom: '1px solid #d0d0d0', paddingBottom: '2px' }}>
            <span style={{ fontSize: '12px', color: '#888888' }}>
              Fecha:
            </span>
            <span style={{ fontSize: '13px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatDate(factura.fecha)}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '32px',
              padding: '8px 16px',
              marginTop: '4px',
              backgroundColor: '#f3f3f3',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#444444' }}>
              Saldo Adeudado:
            </span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(factura.saldo_adeudado)}
            </span>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div style={{ marginBottom: '48px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#333333' }}>
              <th
                style={{ textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#ffffff', padding: '10px 16px', width: '50%' }}
              >
                Artículo
              </th>
              <th
                style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#ffffff', padding: '10px 16px', width: '15%' }}
              >
                Cantidad
              </th>
              <th
                style={{ textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#ffffff', padding: '10px 16px', width: '17.5%' }}
              >
                Tasa
              </th>
              <th
                style={{ textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#ffffff', padding: '10px 16px', width: '17.5%' }}
              >
                Cantidad
              </th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '12px 16px', fontSize: '13px', color: '#222222', fontWeight: 600 }}>
                SERVICIOS PROFESIONALES
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '13px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>
                1
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>
                {formatCurrency(factura.saldo_adeudado)}
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>
                {formatCurrency(factura.saldo_adeudado)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '64px' }}>
        <div style={{ width: '256px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '12px', color: '#888888' }}>Subtotal:</span>
            <span style={{ fontSize: '13px', color: '#222222', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(factura.saldo_adeudado)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '12px', color: '#888888' }}>Impuesto</span>
            <span style={{ fontSize: '13px', color: '#222222', fontFamily: "'JetBrains Mono', monospace" }}>
              USD 0.00
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '12px', color: '#888888' }}>(0%):</span>
            <span style={{ fontSize: '13px', color: '#222222', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(factura.saldo_adeudado)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#111111' }}>Total:</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(factura.saldo_adeudado)}
            </span>
          </div>
        </div>
      </div>

      {/* Notes / Bank Info */}
      <div>
        <p style={{ fontSize: '12px', color: '#888888', marginBottom: '8px', margin: '0 0 8px 0' }}>Notas:</p>
        <div style={{ fontSize: '13px', color: '#444444' }}>
          <p style={{ margin: '0 0 2px 0' }}>{persona.nombre_banco}</p>
          <p style={{ margin: '0 0 2px 0' }}>Cuenta de {persona.tipo_cuenta}</p>
          <p style={{ margin: '0 0 2px 0', fontFamily: "'JetBrains Mono', monospace" }}>{persona.cuenta_bancaria}</p>
          {persona.titular_cuenta && persona.titular_cuenta !== persona.nombre_completo && (
            <p style={{ fontSize: '12px', color: '#888888', marginTop: '4px', margin: '4px 0 0 0' }}>
              Titular: {persona.titular_cuenta}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
