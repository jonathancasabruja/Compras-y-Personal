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
