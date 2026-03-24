/**
 * InvoicePreview — Renders one invoice with multiple department line items.
 * Uses explicit hex colors (no oklch) for PDF/print compatibility.
 */

import type { InvoiceDraft, DeptLineItem } from '@/lib/supabase';

interface Props {
  draft: InvoiceDraft;
  id?: string;
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr: string) {
  const parts = dateStr.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
}

export default function InvoicePreview({ draft, id }: Props) {
  const { persona, departamentos, empresa, fecha, numero_factura, saldo_adeudado } = draft;

  const deptNames = departamentos.map((d) => d.departamento).join(', ');
  const totalHorasExtra = departamentos.reduce((s, d) => s + d.horas_extra, 0);
  const tarifaHoraExtra = departamentos[0]?.tarifa_hora_extra ?? 5;

  return (
    <div
      id={id}
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
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.02em', color: '#111111', textTransform: 'uppercase', margin: 0 }}>
            {persona.nombre_completo}
          </h2>
          <p style={{ fontSize: '12px', color: '#666666', fontFamily: "'JetBrains Mono', monospace", margin: '2px 0 0 0' }}>
            {persona.cedula}{persona.dv && persona.dv.trim() ? ` DV${persona.dv.trim()}` : ''}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 300, letterSpacing: '0.15em', color: '#aaaaaa', lineHeight: 1, margin: 0 }}>
            FACTURA
          </h1>
          <p style={{ fontSize: '13px', color: '#888888', fontFamily: "'JetBrains Mono', monospace", margin: '4px 0 0 0' }}>
            # {numero_factura}
          </p>
        </div>
      </div>

      {/* Billing info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <p style={{ fontSize: '11px', color: '#888888', margin: '0 0 4px 0' }}>Cobrar a:</p>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#111111', margin: 0 }}>{empresa}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '6px', borderBottom: '1px solid #d0d0d0', paddingBottom: '2px' }}>
            <span style={{ fontSize: '11px', color: '#888888' }}>Fecha:</span>
            <span style={{ fontSize: '12px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>{formatDate(fecha)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '6px 12px', marginTop: '4px', backgroundColor: '#f3f3f3' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#444444' }}>Saldo Adeudado:</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>USD {fmt(saldo_adeudado)}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ marginBottom: '24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#333333' }}>
              <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#ffffff', padding: '8px 12px', width: '45%' }}>Artículo</th>
              <th style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: '#ffffff', padding: '8px 12px', width: '15%' }}>Cantidad</th>
              <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, color: '#ffffff', padding: '8px 12px', width: '20%' }}>Tasa</th>
              <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, color: '#ffffff', padding: '8px 12px', width: '20%' }}>Monto</th>
            </tr>
          </thead>
          <tbody>
            {departamentos.map((item: DeptLineItem, idx: number) => (
              <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '10px 12px', fontSize: '12px', color: '#222222', fontWeight: 600 }}>
                  SERVICIOS PROFESIONALES – {item.departamento}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '12px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>
                  {item.dias}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>
                  USD {fmt(item.tarifa_diaria)}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>
                  USD {fmt(item.dias * item.tarifa_diaria)}
                </td>
              </tr>
            ))}
            {totalHorasExtra > 0 && (
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '10px 12px', fontSize: '12px', color: '#222222', fontWeight: 600 }}>HORAS EXTRA</td>
                <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '12px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>{totalHorasExtra}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>USD {fmt(tarifaHoraExtra)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', color: '#444444', fontFamily: "'JetBrains Mono', monospace" }}>USD {fmt(totalHorasExtra * tarifaHoraExtra)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '32px' }}>
        <div style={{ width: '220px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '11px', color: '#888888' }}>Subtotal:</span>
            <span style={{ fontSize: '12px', color: '#222222', fontFamily: "'JetBrains Mono', monospace" }}>USD {fmt(saldo_adeudado)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '11px', color: '#888888' }}>Impuesto (0%):</span>
            <span style={{ fontSize: '12px', color: '#222222', fontFamily: "'JetBrains Mono', monospace" }}>USD 0.00</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#111111' }}>Total:</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>USD {fmt(saldo_adeudado)}</span>
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Notes */}
      <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '16px' }}>
        <p style={{ fontSize: '11px', color: '#888888', margin: '0 0 6px 0' }}>Notas:</p>
        <div style={{ fontSize: '12px', color: '#444444' }}>
          <p style={{ margin: '0 0 6px 0', fontWeight: 600, color: '#222222' }}>Departamento: {deptNames}</p>
          <p style={{ margin: '0 0 2px 0' }}>{persona.nombre_banco}</p>
          <p style={{ margin: '0 0 2px 0' }}>Cuenta de {persona.tipo_cuenta}</p>
          <p style={{ margin: '0 0 2px 0', fontFamily: "'JetBrains Mono', monospace" }}>{persona.cuenta_bancaria}</p>
          {persona.titular_cuenta && persona.titular_cuenta !== persona.nombre_completo && (
            <p style={{ fontSize: '11px', color: '#888888', margin: '4px 0 0 0' }}>Titular: {persona.titular_cuenta}</p>
          )}
        </div>
      </div>
    </div>
  );
}
