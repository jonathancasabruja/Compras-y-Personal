# Refactoring TODO v2

- [ ] 1 factura por persona: sumar todos los departamentos en una sola factura (líneas múltiples en la tabla)
- [ ] Lote multi-persona: permitir agregar facturas de diferentes personas en una sesión
- [ ] Número de factura consecutivo obligatorio (no editable, basado en DB)
- [ ] Botón de configuración para actualizar tarifas por departamento
- [ ] Crear tabla `tarifas_departamento` en Supabase para persistir tarifas
- [ ] Actualizar InvoicePreview para mostrar múltiples líneas de departamento en una factura
- [ ] Actualizar renderInvoiceHTML para múltiples líneas
- [ ] Actualizar Home.tsx para flujo multi-persona
- [ ] Probar todo el flujo
