import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  date,
  timestamp,
  jsonb,
  varchar,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";

export const personas = pgTable("personas", {
  id: serial("id").primaryKey(),
  nombreCompleto: text("nombre_completo").notNull(),
  cedula: text("cedula").notNull(),
  dv: text("dv").default(""),
  cuentaBancaria: text("cuenta_bancaria").notNull(),
  nombreBanco: text("nombre_banco").notNull(),
  tipoCuenta: text("tipo_cuenta").notNull(),
  titularCuenta: text("titular_cuenta").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  activo: boolean("activo").default(true),
  departamentoPrincipal: text("departamento_principal"),
});

export const tarifasDepartamento = pgTable("tarifas_departamento", {
  id: serial("id").primaryKey(),
  clave: text("clave").notNull(),
  nombre: text("nombre").notNull(),
  tarifaDiaria: numeric("tarifa_diaria").notNull(),
  tarifaHoraExtra: numeric("tarifa_hora_extra").notNull().default("5.00"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const tarifasPersona = pgTable("tarifas_persona", {
  id: serial("id").primaryKey(),
  personaId: integer("persona_id").notNull(),
  departamentoClave: text("departamento_clave").notNull(),
  tarifaDiaria: numeric("tarifa_diaria").notNull(),
  tarifaHoraExtra: numeric("tarifa_hora_extra").notNull().default("5.00"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const lotesFacturas = pgTable("lotes_facturas", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  fecha: date("fecha").notNull().defaultNow(),
  totalFacturas: integer("total_facturas").notNull().default(0),
  montoTotal: numeric("monto_total").notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const facturas = pgTable("facturas", {
  id: serial("id").primaryKey(),
  numeroFactura: integer("numero_factura").notNull(),
  fecha: date("fecha").notNull(),
  empresa: text("empresa").notNull(),
  saldoAdeudado: numeric("saldo_adeudado").notNull(),
  personaId: integer("persona_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  departamento: text("departamento"),
  diasTrabajados: integer("dias_trabajados").default(0),
  tarifaDiaria: numeric("tarifa_diaria").default("0"),
  horasExtra: integer("horas_extra").default(0),
  montoHorasExtra: numeric("monto_horas_extra").default("0"),
  detalleDepartamentos: jsonb("detalle_departamentos"),
  loteId: integer("lote_id"),
});

export type Persona = typeof personas.$inferSelect;
export type Factura = typeof facturas.$inferSelect;
export type Lote = typeof lotesFacturas.$inferSelect;
export type TarifaDepartamento = typeof tarifasDepartamento.$inferSelect;
export type TarifaPersona = typeof tarifasPersona.$inferSelect;

// ─── Purchasing enums (mirrored from brewery_dashboard schema) ────────────
// These tables live in the shared Supabase DB. Compras is taking ownership
// of them as of Nov 2026; brewery keeps read-only access + the receive hook
// into raw_materials. See the migration plan in project memory.
export const poStatusEnum = pgEnum("po_status", ["draft", "ordered", "received", "approved"]);
export const allocationMethodEnum = pgEnum("allocation_method", [
  "by_qty", "by_weight", "by_volume", "by_value", "fixed_manual",
]);

// ─── Purchase Orders ──────────────────────────────────────────────────────
export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  poNumber: varchar("po_number", { length: 50 }).notNull().unique(),
  supplier: varchar("supplier", { length: 255 }).notNull(),
  supplierInvoiceNumber: varchar("supplier_invoice_number", { length: 100 }),
  date: varchar("date", { length: 20 }).notNull(),
  expectedDate: varchar("expected_date", { length: 20 }),
  receivedDate: varchar("received_date", { length: 20 }),
  status: poStatusEnum("status").default("draft").notNull(),
  currency: varchar("currency", { length: 10 }).default("USD"),
  paymentCurrency: varchar("payment_currency", { length: 10 }),
  exchangeRate: real("exchange_rate").default(1),
  notes: text("notes"),
  paymentDate: varchar("payment_date", { length: 20 }),
  paymentMethod: varchar("payment_method", { length: 50 }),
  bankAccount: varchar("bank_account", { length: 100 }),
  paymentReference: varchar("payment_reference", { length: 100 }),
  amountTransferred: real("amount_transferred"),
  paymentNotes: text("payment_notes"),
  paymentTerms: varchar("payment_terms", { length: 100 }),
  paymentStatus: varchar("payment_status", { length: 20 }).default("unpaid"),
  amountPaid: real("amount_paid"),
  localCurrency: varchar("local_currency", { length: 10 }).default("GTQ"),
  totalCost: real("total_cost").default(0),
  totalLandedCost: real("total_landed_cost").default(0),
  createdBy: varchar("created_by", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull(),
  productCode: varchar("product_code", { length: 50 }).notNull(),
  productDescription: varchar("product_description", { length: 255 }),
  category: varchar("category", { length: 50 }),
  qty: real("qty").notNull(),
  unit: varchar("unit", { length: 20 }),
  supplierQty: real("supplier_qty"),
  supplierUom: varchar("supplier_uom", { length: 20 }),
  supplierLotNumber: varchar("supplier_lot_number", { length: 100 }),
  baseCostPerUnit: real("base_cost_per_unit").default(0),
  baseTotalCost: real("base_total_cost").default(0),
  allocatedExtraCosts: real("allocated_extra_costs").default(0),
  allocatedExtraCostPerUnit: real("allocated_extra_cost_per_unit").default(0),
  extraCostBreakdown: text("extra_cost_breakdown"),
  landedTotalCost: real("landed_total_cost").default(0),
  landedCostPerUnit: real("landed_cost_per_unit").default(0),
  landedCostLocal: real("landed_cost_local"),
  landedCostPerUnitLocal: real("landed_cost_per_unit_local"),
  weightKg: real("weight_kg"),
  volumeL: real("volume_l"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = typeof purchaseOrderItems.$inferInsert;

export const purchaseOrderExtraCosts = pgTable("purchase_order_extra_costs", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull(),
  costType: varchar("cost_type", { length: 100 }).notNull(),
  description: varchar("description", { length: 255 }),
  amount: real("amount").default(0).notNull(),
  allocationMethod: allocationMethodEnum("allocation_method").default("by_qty").notNull(),
  costInvoiceId: integer("cost_invoice_id"),
  costInvoiceAllocationId: integer("cost_invoice_allocation_id"),
  costInvoiceRef: varchar("cost_invoice_ref", { length: 100 }),
  allocationPercentage: real("allocation_percentage"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PurchaseOrderExtraCost = typeof purchaseOrderExtraCosts.$inferSelect;
export type InsertPurchaseOrderExtraCost = typeof purchaseOrderExtraCosts.$inferInsert;

export const purchaseOrderAttachments = pgTable("purchase_order_attachments", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull(),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  fileName: varchar("file_name", { length: 255 }),
  fileKey: varchar("file_key", { length: 500 }),
  documentType: varchar("document_type", { length: 100 }),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export type PurchaseOrderAttachment = typeof purchaseOrderAttachments.$inferSelect;
export type InsertPurchaseOrderAttachment = typeof purchaseOrderAttachments.$inferInsert;

// ─── Cost Invoices (Pool: freight, customs, comisiones → "Fletes y Gastos") ─
export const costInvoices = pgTable("cost_invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: varchar("invoice_number", { length: 100 }).notNull(),
  supplier: varchar("supplier", { length: 255 }).notNull(),
  costType: varchar("cost_type", { length: 100 }).notNull(),
  date: varchar("date", { length: 20 }).notNull(),
  totalAmount: real("total_amount").notNull(),
  currency: varchar("currency", { length: 10 }).default("USD"),
  allocatedAmount: real("allocated_amount").default(0).notNull(),
  remainingAmount: real("remaining_amount").notNull(),
  pdfUrl: varchar("pdf_url", { length: 500 }),
  pdfFileName: varchar("pdf_file_name", { length: 255 }),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CostInvoice = typeof costInvoices.$inferSelect;
export type InsertCostInvoice = typeof costInvoices.$inferInsert;

export const costInvoiceAllocations = pgTable("cost_invoice_allocations", {
  id: serial("id").primaryKey(),
  costInvoiceId: integer("cost_invoice_id").notNull(),
  purchaseOrderId: integer("purchase_order_id").notNull(),
  percentage: real("percentage").notNull(),
  allocatedAmount: real("allocated_amount").notNull(),
  sourceCurrency: varchar("source_currency", { length: 10 }),
  targetCurrency: varchar("target_currency", { length: 10 }),
  exchangeRate: real("exchange_rate").default(1),
  convertedAmount: real("converted_amount"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CostInvoiceAllocation = typeof costInvoiceAllocations.$inferSelect;
export type InsertCostInvoiceAllocation = typeof costInvoiceAllocations.$inferInsert;

export const supplierProductMappings = pgTable("supplier_product_mappings", {
  id: serial("id").primaryKey(),
  supplierName: varchar("supplier_name", { length: 255 }).notNull(),
  supplierDescription: varchar("supplier_description", { length: 255 }).notNull(),
  internalProductCode: varchar("internal_product_code", { length: 50 }).notNull(),
  timesUsed: integer("times_used").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SupplierProductMapping = typeof supplierProductMappings.$inferSelect;
export type InsertSupplierProductMapping = typeof supplierProductMappings.$inferInsert;

// ─── Supplier Invoice Library ─────────────────────────────────────────────
// Master repository of every supplier PDF. AI-classified at upload time,
// user-overridable. OCs and Fletes y Gastos pick invoices from here rather
// than uploading directly.

export const invoiceCategoryEnum = pgEnum("invoice_category", [
  "brewing_raw_materials",
  "brewing_packaging",
  "brewing_equipment",
  "logistics",
  "taproom_food",
  "taproom_beverages",
  "taproom_supplies",
  "utilities",
  "services",
  "rent_facility",
  "other",
]);

export const supplierInvoices = pgTable("supplier_invoices", {
  id: serial("id").primaryKey(),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  fileKey: varchar("file_key", { length: 500 }).notNull(),
  originalFilename: varchar("original_filename", { length: 255 }),
  storedFilename: varchar("stored_filename", { length: 255 }),
  supplier: varchar("supplier", { length: 255 }),
  invoiceNumber: varchar("invoice_number", { length: 100 }),
  invoiceDate: varchar("invoice_date", { length: 20 }),
  currency: varchar("currency", { length: 10 }).default("USD"),
  totalAmount: real("total_amount").default(0),
  category: invoiceCategoryEnum("category").default("other").notNull(),
  categoryWasManual: boolean("category_was_manual").default(false).notNull(),
  briefDescription: text("brief_description"),
  extractedData: jsonb("extracted_data"),
  usedInPoId: integer("used_in_po_id"),
  usedInCostInvoiceId: integer("used_in_cost_invoice_id"),
  notes: text("notes"),
  uploadedBy: varchar("uploaded_by", { length: 100 }),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SupplierInvoice = typeof supplierInvoices.$inferSelect;
export type InsertSupplierInvoice = typeof supplierInvoices.$inferInsert;
