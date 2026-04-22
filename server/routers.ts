/**
 * Server-side data router. Replaces direct Supabase anon-key calls from
 * the browser. All DB access goes through postgres superuser via
 * db.ts → Supabase.
 */

import { z } from "zod";
import { and, asc, desc, eq, inArray, or, ilike, sql as drizzleSql } from "drizzle-orm";
import { router, publicProcedure } from "./trpc";
import { getDb } from "./db";
import {
  personas,
  facturas,
  lotesFacturas,
  tarifasDepartamento,
  tarifasPersona,
} from "../drizzle/schema";
import {
  getAllPurchaseOrders,
  getPurchaseOrderById,
  getNextPoNumber,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  calculateAndSaveLandedCosts,
  setPurchaseOrderStatus,
  addPoAttachment,
  deletePoAttachment,
  getPoAttachment,
  getPoAttachments,
  getSupplierProductMappings,
  learnSupplierMappings,
  normalizeUom,
  getAllCostInvoices,
  getCostInvoiceById,
  createCostInvoice,
  updateCostInvoice,
  deleteCostInvoice,
  allocateCostInvoice,
  deallocateCostInvoice,
  getCostInvoiceAllocationsForPo,
  listCatalogForExtraction,
  listSupplierMappingsForExtraction,
} from "./purchasingDb";
import { storagePut, storageDelete, isStorageConfigured } from "./storage";
import {
  extractPoFromPdf,
  extractCostInvoiceFromPdf,
  isExtractorConfigured,
  INVOICE_CATEGORIES,
  type InvoiceCategory,
} from "./invoiceExtractor";
import {
  listSupplierInvoices,
  countByCategory,
  getSupplierInvoice,
  createSupplierInvoice,
  updateSupplierInvoice,
  deleteSupplierInvoice,
  linkInvoiceToPo,
  linkInvoiceToCostInvoice,
} from "./invoiceLibraryDb";

// ─── Helpers ────────────────────────────────────────────────────────────────

function reqDb() {
  const db = getDb();
  if (!db) throw new Error("DB not available");
  return db;
}

// Map a Drizzle personas row → API shape (camelCase → snake_case for frontend compatibility).
function personaOut(p: any) {
  return {
    id: p.id,
    nombre_completo: p.nombreCompleto,
    cedula: p.cedula,
    dv: p.dv ?? "",
    cuenta_bancaria: p.cuentaBancaria,
    nombre_banco: p.nombreBanco,
    tipo_cuenta: p.tipoCuenta,
    titular_cuenta: p.titularCuenta,
    activo: p.activo ?? true,
    departamento_principal: p.departamentoPrincipal,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

function tarifaDepOut(t: any) {
  return {
    id: t.id,
    clave: t.clave,
    nombre: t.nombre,
    tarifa_diaria: Number(t.tarifaDiaria),
    tarifa_hora_extra: Number(t.tarifaHoraExtra),
  };
}

function tarifaPersonaOut(t: any) {
  return {
    id: t.id,
    persona_id: t.personaId,
    departamento_clave: t.departamentoClave,
    tarifa_diaria: Number(t.tarifaDiaria),
    tarifa_hora_extra: Number(t.tarifaHoraExtra),
  };
}

function loteOut(l: any) {
  return {
    id: l.id,
    nombre: l.nombre,
    fecha: typeof l.fecha === "string" ? l.fecha : l.fecha?.toISOString?.()?.split("T")[0],
    total_facturas: l.totalFacturas,
    monto_total: Number(l.montoTotal),
    created_at: l.createdAt,
  };
}

function facturaOut(f: any, p?: any) {
  return {
    id: f.id,
    numero_factura: f.numeroFactura,
    fecha: typeof f.fecha === "string" ? f.fecha : f.fecha?.toISOString?.()?.split("T")[0],
    empresa: f.empresa,
    saldo_adeudado: Number(f.saldoAdeudado),
    persona_id: f.personaId,
    created_at: f.createdAt,
    departamento: f.departamento,
    dias_trabajados: f.diasTrabajados ?? 0,
    tarifa_diaria: Number(f.tarifaDiaria ?? 0),
    horas_extra: f.horasExtra ?? 0,
    monto_horas_extra: Number(f.montoHorasExtra ?? 0),
    detalle_departamentos: f.detalleDepartamentos,
    lote_id: f.loteId,
    persona: p ? personaOut(p) : undefined,
  };
}

// ─── Personas ───────────────────────────────────────────────────────────────

const personasRouter = router({
  listActive: publicProcedure.query(async () => {
    const db = reqDb();
    const rows = await db.select().from(personas).where(eq(personas.activo, true)).orderBy(asc(personas.nombreCompleto));
    return rows.map(personaOut);
  }),

  listAll: publicProcedure.query(async () => {
    const db = reqDb();
    const rows = await db.select().from(personas).orderBy(desc(personas.activo), asc(personas.nombreCompleto));
    return rows.map(personaOut);
  }),

  toggleActivo: publicProcedure
    .input(z.object({ id: z.number(), activo: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = reqDb();
      await db.update(personas).set({ activo: input.activo, updatedAt: new Date() }).where(eq(personas.id, input.id));
      return { ok: true };
    }),

  updateDepartamento: publicProcedure
    .input(z.object({ id: z.number(), departamento: z.string() }))
    .mutation(async ({ input }) => {
      const db = reqDb();
      await db.update(personas)
        .set({ departamentoPrincipal: input.departamento, updatedAt: new Date() })
        .where(eq(personas.id, input.id));
      return { ok: true };
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      data: z.object({
        nombre_completo: z.string().optional(),
        cedula: z.string().optional(),
        dv: z.string().optional(),
        cuenta_bancaria: z.string().optional(),
        nombre_banco: z.string().optional(),
        tipo_cuenta: z.string().optional(),
        titular_cuenta: z.string().optional(),
        activo: z.boolean().optional(),
        departamento_principal: z.string().nullable().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const db = reqDb();
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      const d = input.data;
      if (d.nombre_completo !== undefined) patch.nombreCompleto = d.nombre_completo;
      if (d.cedula !== undefined) patch.cedula = d.cedula;
      if (d.dv !== undefined) patch.dv = d.dv;
      if (d.cuenta_bancaria !== undefined) patch.cuentaBancaria = d.cuenta_bancaria;
      if (d.nombre_banco !== undefined) patch.nombreBanco = d.nombre_banco;
      if (d.tipo_cuenta !== undefined) patch.tipoCuenta = d.tipo_cuenta;
      if (d.titular_cuenta !== undefined) patch.titularCuenta = d.titular_cuenta;
      if (d.activo !== undefined) patch.activo = d.activo;
      if (d.departamento_principal !== undefined) patch.departamentoPrincipal = d.departamento_principal;
      await db.update(personas).set(patch).where(eq(personas.id, input.id));
      return { ok: true };
    }),

  search: publicProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      const q = input.query.trim();
      if (!q) return [];
      const db = reqDb();
      const pattern = `%${q}%`;
      const rows = await db.select().from(personas)
        .where(or(ilike(personas.nombreCompleto, pattern), ilike(personas.cedula, pattern)))
        .orderBy(asc(personas.nombreCompleto))
        .limit(10);
      return rows.map(personaOut);
    }),

  create: publicProcedure
    .input(z.object({
      nombre_completo: z.string(),
      cedula: z.string(),
      dv: z.string().optional(),
      cuenta_bancaria: z.string(),
      nombre_banco: z.string(),
      tipo_cuenta: z.string(),
      titular_cuenta: z.string(),
      activo: z.boolean().optional(),
      departamento_principal: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = reqDb();
      const [row] = await db.insert(personas).values({
        nombreCompleto: input.nombre_completo,
        cedula: input.cedula,
        dv: input.dv ?? "",
        cuentaBancaria: input.cuenta_bancaria,
        nombreBanco: input.nombre_banco,
        tipoCuenta: input.tipo_cuenta,
        titularCuenta: input.titular_cuenta,
        activo: input.activo ?? true,
        departamentoPrincipal: input.departamento_principal ?? null,
      }).returning();
      return personaOut(row);
    }),
});

// ─── Tarifas ────────────────────────────────────────────────────────────────

const tarifasRouter = router({
  listDepartamento: publicProcedure.query(async () => {
    const db = reqDb();
    const rows = await db.select().from(tarifasDepartamento).orderBy(asc(tarifasDepartamento.id));
    return rows.map(tarifaDepOut);
  }),

  updateDepartamento: publicProcedure
    .input(z.object({ clave: z.string(), tarifa_diaria: z.number(), tarifa_hora_extra: z.number() }))
    .mutation(async ({ input }) => {
      const db = reqDb();
      await db.update(tarifasDepartamento).set({
        tarifaDiaria: input.tarifa_diaria.toString(),
        tarifaHoraExtra: input.tarifa_hora_extra.toString(),
        updatedAt: new Date(),
      }).where(eq(tarifasDepartamento.clave, input.clave));
      return { ok: true };
    }),

  listPersona: publicProcedure
    .input(z.object({ personaId: z.number() }))
    .query(async ({ input }) => {
      const db = reqDb();
      const rows = await db.select().from(tarifasPersona).where(eq(tarifasPersona.personaId, input.personaId));
      return rows.map(tarifaPersonaOut);
    }),

  upsertPersona: publicProcedure
    .input(z.object({
      persona_id: z.number(),
      departamento_clave: z.string(),
      tarifa_diaria: z.number(),
      tarifa_hora_extra: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = reqDb();
      // Manual upsert: try update, else insert
      const existing = await db.select({ id: tarifasPersona.id }).from(tarifasPersona)
        .where(and(eq(tarifasPersona.personaId, input.persona_id), eq(tarifasPersona.departamentoClave, input.departamento_clave)))
        .limit(1);
      if (existing.length > 0) {
        await db.update(tarifasPersona).set({
          tarifaDiaria: input.tarifa_diaria.toString(),
          tarifaHoraExtra: input.tarifa_hora_extra.toString(),
          updatedAt: new Date(),
        }).where(eq(tarifasPersona.id, existing[0].id));
      } else {
        await db.insert(tarifasPersona).values({
          personaId: input.persona_id,
          departamentoClave: input.departamento_clave,
          tarifaDiaria: input.tarifa_diaria.toString(),
          tarifaHoraExtra: input.tarifa_hora_extra.toString(),
        });
      }
      return { ok: true };
    }),

  deletePersona: publicProcedure
    .input(z.object({ persona_id: z.number(), departamento_clave: z.string() }))
    .mutation(async ({ input }) => {
      const db = reqDb();
      await db.delete(tarifasPersona).where(
        and(eq(tarifasPersona.personaId, input.persona_id), eq(tarifasPersona.departamentoClave, input.departamento_clave))
      );
      return { ok: true };
    }),
});

// ─── Facturas ───────────────────────────────────────────────────────────────

const facturasRouter = router({
  lastForPersona: publicProcedure
    .input(z.object({ personaId: z.number() }))
    .query(async ({ input }) => {
      const db = reqDb();
      const rows = await db.select({
        numero_factura: facturas.numeroFactura,
        fecha: facturas.fecha,
        empresa: facturas.empresa,
        saldo_adeudado: facturas.saldoAdeudado,
        departamento: facturas.departamento,
      }).from(facturas)
        .where(eq(facturas.personaId, input.personaId))
        .orderBy(desc(facturas.numeroFactura))
        .limit(1);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        numero_factura: r.numero_factura,
        fecha: typeof r.fecha === "string" ? r.fecha : (r.fecha as Date)?.toISOString?.()?.split("T")[0],
        empresa: r.empresa,
        saldo_adeudado: Number(r.saldo_adeudado),
        departamento: r.departamento ?? undefined,
      };
    }),

  nextNumberGlobal: publicProcedure.query(async () => {
    const db = reqDb();
    const rows = await db.select({ n: facturas.numeroFactura }).from(facturas)
      .orderBy(desc(facturas.numeroFactura)).limit(1);
    if (rows.length === 0) return 1;
    return rows[0].n + 1;
  }),

  checkDuplicate: publicProcedure
    .input(z.object({ persona_id: z.number(), numero_factura: z.number() }))
    .query(async ({ input }) => {
      const db = reqDb();
      const hit = await db.select({ id: facturas.id }).from(facturas)
        .where(and(eq(facturas.personaId, input.persona_id), eq(facturas.numeroFactura, input.numero_factura)))
        .limit(1);
      const max = await db.select({ n: facturas.numeroFactura }).from(facturas)
        .where(eq(facturas.personaId, input.persona_id))
        .orderBy(desc(facturas.numeroFactura)).limit(1);
      return { existe: hit.length > 0, siguiente: (max[0]?.n ?? 0) + 1 };
    }),

  saveBatch: publicProcedure
    .input(z.object({
      facturas: z.array(z.object({
        numero_factura: z.number(),
        fecha: z.string(),
        empresa: z.string(),
        saldo_adeudado: z.number(),
        persona_id: z.number(),
        departamento: z.string(),
        dias_trabajados: z.number(),
        tarifa_diaria: z.number(),
        horas_extra: z.number(),
        monto_horas_extra: z.number(),
        detalle_departamentos: z.any(),
        lote_id: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = reqDb();
      const duplicados: string[] = [];

      // Insert one by one so a single duplicate doesn't abort the whole batch.
      for (const f of input.facturas) {
        try {
          await db.insert(facturas).values({
            numeroFactura: f.numero_factura,
            fecha: f.fecha as any,
            empresa: f.empresa,
            saldoAdeudado: f.saldo_adeudado.toString(),
            personaId: f.persona_id,
            departamento: f.departamento,
            diasTrabajados: f.dias_trabajados,
            tarifaDiaria: f.tarifa_diaria.toString(),
            horasExtra: f.horas_extra,
            montoHorasExtra: f.monto_horas_extra.toString(),
            detalleDepartamentos: f.detalle_departamentos as any,
            loteId: f.lote_id,
          });
        } catch (err: any) {
          const msg = err?.message ?? "";
          if (msg.includes("duplicate") || err?.code === "23505") {
            const p = await db.select({ n: personas.nombreCompleto }).from(personas).where(eq(personas.id, f.persona_id)).limit(1);
            const nombre = p[0]?.n ?? `ID ${f.persona_id}`;
            duplicados.push(`#${f.numero_factura} (${nombre})`);
          } else {
            throw err;
          }
        }
      }
      return { duplicados };
    }),

  list: publicProcedure.query(async () => {
    const db = reqDb();
    const rows = await db.select().from(facturas)
      .orderBy(desc(facturas.numeroFactura)).limit(100);
    if (rows.length === 0) return [];
    const ids = Array.from(new Set(rows.map(r => r.personaId)));
    const ps = await db.select().from(personas).where(inArray(personas.id, ids));
    const pMap = new Map(ps.map(p => [p.id, p]));
    return rows.map(f => facturaOut(f, pMap.get(f.personaId)));
  }),

  byLote: publicProcedure
    .input(z.object({ loteId: z.number() }))
    .query(async ({ input }) => {
      const db = reqDb();
      const rows = await db.select().from(facturas)
        .where(eq(facturas.loteId, input.loteId))
        .orderBy(asc(facturas.numeroFactura));
      if (rows.length === 0) return [];
      const ids = Array.from(new Set(rows.map(r => r.personaId)));
      const ps = await db.select().from(personas).where(inArray(personas.id, ids));
      const pMap = new Map(ps.map(p => [p.id, p]));
      return rows.map(f => facturaOut(f, pMap.get(f.personaId)));
    }),
});

// ─── Lotes ──────────────────────────────────────────────────────────────────

const lotesRouter = router({
  create: publicProcedure
    .input(z.object({
      nombre: z.string(),
      fecha: z.string(),
      total_facturas: z.number(),
      monto_total: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = reqDb();
      const [row] = await db.insert(lotesFacturas).values({
        nombre: input.nombre,
        fecha: input.fecha as any,
        totalFacturas: input.total_facturas,
        montoTotal: input.monto_total.toString(),
      }).returning();
      return loteOut(row);
    }),

  list: publicProcedure.query(async () => {
    const db = reqDb();
    const rows = await db.select().from(lotesFacturas).orderBy(desc(lotesFacturas.createdAt));
    return rows.map(loteOut);
  }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = reqDb();
      // Cascade: delete facturas first, then lote.
      await db.delete(facturas).where(eq(facturas.loteId, input.id));
      await db.delete(lotesFacturas).where(eq(lotesFacturas.id, input.id));
      return { ok: true };
    }),
});

// ─── Purchase Orders ────────────────────────────────────────────────────────

const poItemInput = z.object({
  productCode: z.string(),
  productDescription: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  qty: z.number(),
  unit: z.string().nullable().optional(),
  supplierQty: z.number().nullable().optional(),
  supplierUom: z.string().nullable().optional(),
  supplierLotNumber: z.string().nullable().optional(),
  baseCostPerUnit: z.number().optional(),
  weightKg: z.number().nullable().optional(),
  volumeL: z.number().nullable().optional(),
});

const poExtraCostInput = z.object({
  costType: z.string(),
  description: z.string().nullable().optional(),
  amount: z.number(),
  allocationMethod: z.enum(["by_qty", "by_weight", "by_volume", "by_value", "fixed_manual"]).optional(),
});

const purchaseOrdersRouter = router({
  list: publicProcedure.query(() => getAllPurchaseOrders()),
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getPurchaseOrderById(input.id)),
  nextNumber: publicProcedure.query(() => getNextPoNumber()),
  create: publicProcedure
    .input(z.object({
      poNumber: z.string(),
      supplier: z.string(),
      supplierInvoiceNumber: z.string().nullable().optional(),
      date: z.string(),
      expectedDate: z.string().nullable().optional(),
      currency: z.string().optional(),
      exchangeRate: z.number().optional(),
      localCurrency: z.string().optional(),
      paymentTerms: z.string().nullable().optional(),
      paymentMethod: z.string().nullable().optional(),
      paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
      amountPaid: z.number().nullable().optional(),
      paymentDate: z.string().nullable().optional(),
      paymentReference: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      createdBy: z.string().nullable().optional(),
      items: z.array(poItemInput),
      extraCosts: z.array(poExtraCostInput).optional(),
    }))
    .mutation(async ({ input }) => {
      const { items, extraCosts, ...poData } = input;
      const normalizedItems = items.map((item) => {
        if (item.supplierUom && item.supplierQty) {
          const norm = normalizeUom(item.supplierQty, item.supplierUom);
          return {
            ...item,
            qty: norm.normalizedQty,
            unit: norm.normalizedUnit,
            weightKg: norm.normalizedQty,
            supplierQty: norm.supplierQty,
            supplierUom: norm.supplierUom,
          };
        }
        return item;
      });
      const po = await createPurchaseOrder(poData, normalizedItems, extraCosts || []);
      if (po) {
        await calculateAndSaveLandedCosts(po.id);
        await learnSupplierMappings(poData.supplier, normalizedItems);
      }
      return po;
    }),
  update: publicProcedure
    .input(z.object({
      id: z.number(),
      poNumber: z.string().optional(),
      supplier: z.string().optional(),
      supplierInvoiceNumber: z.string().nullable().optional(),
      date: z.string().optional(),
      expectedDate: z.string().nullable().optional(),
      status: z.enum(["draft", "ordered", "received", "approved"]).optional(),
      currency: z.string().optional(),
      exchangeRate: z.number().optional(),
      localCurrency: z.string().optional(),
      paymentTerms: z.string().nullable().optional(),
      paymentMethod: z.string().nullable().optional(),
      paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
      amountPaid: z.number().nullable().optional(),
      paymentDate: z.string().nullable().optional(),
      paymentReference: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      items: z.array(poItemInput).optional(),
      extraCosts: z.array(poExtraCostInput).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, items, extraCosts, ...poData } = input;
      const normalizedItems = items?.map((item) => {
        if (item.supplierUom && item.supplierQty) {
          const norm = normalizeUom(item.supplierQty, item.supplierUom);
          return {
            ...item,
            qty: norm.normalizedQty,
            unit: norm.normalizedUnit,
            weightKg: norm.normalizedQty,
            supplierQty: norm.supplierQty,
            supplierUom: norm.supplierUom,
          };
        }
        return item;
      });
      const po = await updatePurchaseOrder(id, poData, normalizedItems, extraCosts);
      if (po) {
        await calculateAndSaveLandedCosts(id);
        if (normalizedItems && poData.supplier) {
          await learnSupplierMappings(poData.supplier, normalizedItems);
        }
      }
      return po;
    }),
  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deletePurchaseOrder(input.id)),
  setStatus: publicProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["draft", "ordered", "received", "approved"]),
      receivedDate: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      await setPurchaseOrderStatus(input.id, input.status, input.receivedDate);
      return { ok: true };
    }),
  approve: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await setPurchaseOrderStatus(input.id, "approved");
      return { ok: true };
    }),
  recalcLanded: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => calculateAndSaveLandedCosts(input.id)),
  supplierMappings: publicProcedure
    .input(z.object({ supplierName: z.string().optional() }))
    .query(({ input }) => getSupplierProductMappings(input.supplierName)),
  normalizeUomPreview: publicProcedure
    .input(z.object({ qty: z.number(), uom: z.string() }))
    .query(({ input }) => normalizeUom(input.qty, input.uom)),
  /**
   * AI PDF extractor. Client sends a base64 PDF (≤ 8 MB), server calls
   * OpenAI gpt-4o-mini, returns structured PO data ready to prefill the
   * "Nueva OC" dialog. Graceful error when OPENAI_API_KEY is missing.
   */
  extractorConfigured: publicProcedure.query(() => ({
    configured: isExtractorConfigured(),
  })),
  extractInvoice: publicProcedure
    .input(z.object({ dataBase64: z.string().min(1) }))
    .mutation(async ({ input }) => {
      // Feed the extractor authoritative brewery data so it uses canonical
      // product codes instead of the supplier's random codes. Both queries
      // are cheap — catalog ~50 rows, supplier mappings ~25 rows.
      const [catalog, supplierMappings] = await Promise.all([
        listCatalogForExtraction().catch(() => []),
        listSupplierMappingsForExtraction().catch(() => []),
      ]);
      return extractPoFromPdf(input.dataBase64, {
        catalog: catalog.map((c) => ({
          productCode: c.productCode,
          name: c.name,
          category: c.category,
          unit: c.unit,
        })),
        supplierMappings,
      });
    }),
  attachments: router({
    list: publicProcedure
      .input(z.object({ purchaseOrderId: z.number() }))
      .query(({ input }) => getPoAttachments(input.purchaseOrderId)),
    add: publicProcedure
      .input(z.object({
        purchaseOrderId: z.number(),
        fileUrl: z.string(),
        fileName: z.string().nullable().optional(),
        fileKey: z.string().nullable().optional(),
        documentType: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => addPoAttachment(input)),
    /**
     * Browser-friendly upload path. Client sends base64-encoded bytes
     * through tRPC (Express JSON limit = 10MB, plenty for any realistic
     * PO PDF). We push the file to Manus storage if configured, then
     * create the DB row. If storage is not configured, we still create
     * the DB row but with an empty fileUrl — so the attachments list
     * shows the file name + a "storage not configured" warning rather
     * than silently dropping the upload.
     */
    upload: publicProcedure
      .input(
        z.object({
          purchaseOrderId: z.number(),
          fileName: z.string().min(1),
          contentType: z.string().default("application/octet-stream"),
          dataBase64: z.string().min(1),
          documentType: z.string().nullable().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const bytes = Buffer.from(input.dataBase64, "base64");
        // Key scheme: po/<poId>/<epoch>-<sanitized-filename>
        const safe = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
        const key = `po/${input.purchaseOrderId}/${Date.now()}-${safe}`;
        const stored = await storagePut(key, new Uint8Array(bytes), input.contentType);
        const row = await addPoAttachment({
          purchaseOrderId: input.purchaseOrderId,
          fileUrl: stored.url,
          fileName: input.fileName,
          fileKey: stored.key,
          documentType: input.documentType ?? null,
        });
        return {
          attachment: row,
          storageConfigured: isStorageConfigured(),
        };
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        // Remove the cloud file first (best-effort) before dropping the row.
        // If storage isn't configured or the object is already gone, we still
        // want the DB row to go so the UI doesn't show a broken attachment.
        const existing = await getPoAttachment(input.id);
        if (existing?.fileKey) {
          await storageDelete(existing.fileKey).catch(() => undefined);
        }
        await deletePoAttachment(input.id);
        return { ok: true };
      }),
    storageConfigured: publicProcedure.query(() => ({
      configured: isStorageConfigured(),
    })),
  }),
});

// ─── Cost Invoices (Pool — "Fletes y Gastos") ──────────────────────────────

const costInvoicesRouter = router({
  list: publicProcedure.query(() => getAllCostInvoices()),
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getCostInvoiceById(input.id)),
  create: publicProcedure
    .input(z.object({
      invoiceNumber: z.string(),
      supplier: z.string(),
      costType: z.string(),
      date: z.string(),
      totalAmount: z.number(),
      currency: z.string().optional(),
      pdfUrl: z.string().nullable().optional(),
      pdfFileName: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      createdBy: z.string().nullable().optional(),
    }))
    .mutation(({ input }) => createCostInvoice(input)),
  update: publicProcedure
    .input(z.object({
      id: z.number(),
      invoiceNumber: z.string().optional(),
      supplier: z.string().optional(),
      costType: z.string().optional(),
      date: z.string().optional(),
      totalAmount: z.number().optional(),
      currency: z.string().optional(),
      pdfUrl: z.string().nullable().optional(),
      pdfFileName: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return updateCostInvoice(id, data);
    }),
  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteCostInvoice(input.id)),
  allocate: publicProcedure
    .input(z.object({
      costInvoiceId: z.number(),
      purchaseOrderId: z.number(),
      percentage: z.number().min(0).max(100).optional(),
      amount: z.number().min(0).optional(),
      notes: z.string().nullable().optional(),
      exchangeRate: z.number().positive().nullable().optional(),
    }).refine((d) => d.percentage || d.amount, {
      message: "Either percentage or amount is required",
    }))
    .mutation(({ input }) =>
      allocateCostInvoice(
        input.costInvoiceId,
        input.purchaseOrderId,
        input.percentage || null,
        input.amount || null,
        input.notes,
        input.exchangeRate,
      ),
    ),
  deallocate: publicProcedure
    .input(z.object({ allocationId: z.number() }))
    .mutation(({ input }) => deallocateCostInvoice(input.allocationId)),
  allocationsForPo: publicProcedure
    .input(z.object({ purchaseOrderId: z.number() }))
    .query(({ input }) => getCostInvoiceAllocationsForPo(input.purchaseOrderId)),
  extractorConfigured: publicProcedure.query(() => ({
    configured: isExtractorConfigured(),
  })),
  extractInvoice: publicProcedure
    .input(z.object({ dataBase64: z.string().min(1) }))
    .mutation(({ input }) => extractCostInvoiceFromPdf(input.dataBase64)),
});

// ─── Supplier Invoice Library ─────────────────────────────────────────────

const invoiceCategoryEnum = z.enum(INVOICE_CATEGORIES);

function sanitizeForFilename(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "invoice";
}

const invoiceLibraryRouter = router({
  extractorConfigured: publicProcedure.query(() => ({
    configured: isExtractorConfigured(),
    storage: isStorageConfigured(),
  })),

  list: publicProcedure
    .input(
      z
        .object({
          category: invoiceCategoryEnum.optional(),
          search: z.string().optional(),
          unlinkedOnly: z.boolean().optional(),
          limit: z.number().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(({ input }) => listSupplierInvoices(input ?? {})),

  counts: publicProcedure.query(() => countByCategory()),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getSupplierInvoice(input.id)),

  /**
   * Upload a PDF (base64) to the library. Runs AI extraction, then stores
   * the PDF in Supabase Storage as `invoices/<category>/<supplier>-<date>.pdf`
   * and inserts the row with the full extracted payload. UX: the client
   * already compresses before sending, so `dataBase64` is the post-compress
   * blob (typically 200-800 KB).
   */
  upload: publicProcedure
    .input(
      z.object({
        originalFilename: z.string().min(1),
        contentType: z.string().default("application/pdf"),
        dataBase64: z.string().min(1),
        uploadedBy: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // Extract first so we know supplier + date + category for the filename
      const extracted = await extractPoFromPdf(input.dataBase64).catch((err) => {
        console.warn("[invoiceLibrary] AI extraction failed, saving with placeholders", err);
        return null;
      });

      const category: InvoiceCategory = (extracted?.category ?? "other") as InvoiceCategory;
      const supplier = extracted?.supplier?.trim() || "unknown-supplier";
      const date = extracted?.date || new Date().toISOString().split("T")[0];
      const storedFilename = `${sanitizeForFilename(supplier)}-${sanitizeForFilename(date)}.pdf`;
      const key = `invoices/${category}/${Date.now()}-${storedFilename}`;

      const bytes = Buffer.from(input.dataBase64, "base64");
      const uploaded = await storagePut(key, new Uint8Array(bytes), input.contentType);

      const row = await createSupplierInvoice({
        fileUrl: uploaded.url,
        fileKey: uploaded.key,
        originalFilename: input.originalFilename,
        storedFilename,
        supplier,
        invoiceNumber: extracted?.invoiceNumber ?? null,
        invoiceDate: date,
        currency: extracted?.currency ?? "USD",
        totalAmount: extracted?.totalAmount ?? 0,
        category,
        categoryWasManual: false,
        briefDescription: extracted?.briefDescription ?? null,
        extractedData: extracted as any,
        uploadedBy: input.uploadedBy ?? null,
      });

      return {
        invoice: row,
        storageConfigured: isStorageConfigured(),
        extractorRan: !!extracted,
      };
    }),

  /**
   * User edits: supplier, date, category, description, notes, etc. When
   * category changes, we mark categoryWasManual so a future re-extract
   * doesn't silently clobber the user's choice.
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        supplier: z.string().nullable().optional(),
        invoiceNumber: z.string().nullable().optional(),
        invoiceDate: z.string().nullable().optional(),
        currency: z.string().optional(),
        totalAmount: z.number().optional(),
        category: invoiceCategoryEnum.optional(),
        briefDescription: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, category, ...rest } = input;
      const patch: Record<string, unknown> = { ...rest };
      if (category !== undefined) {
        patch.category = category;
        patch.categoryWasManual = true;
      }
      return updateSupplierInvoice(id, patch as any);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const existing = await getSupplierInvoice(input.id);
      if (existing?.fileKey) {
        await storageDelete(existing.fileKey).catch(() => undefined);
      }
      await deleteSupplierInvoice(input.id);
      return { ok: true };
    }),

  linkToPo: publicProcedure
    .input(z.object({ invoiceId: z.number(), poId: z.number().nullable() }))
    .mutation(async ({ input }) => {
      await linkInvoiceToPo(input.invoiceId, input.poId);
      return { ok: true };
    }),

  linkToCostInvoice: publicProcedure
    .input(z.object({ invoiceId: z.number(), costInvoiceId: z.number().nullable() }))
    .mutation(async ({ input }) => {
      await linkInvoiceToCostInvoice(input.invoiceId, input.costInvoiceId);
      return { ok: true };
    }),
});

export const appRouter = router({
  personas: personasRouter,
  tarifas: tarifasRouter,
  facturas: facturasRouter,
  lotes: lotesRouter,
  purchaseOrders: purchaseOrdersRouter,
  costInvoices: costInvoicesRouter,
  invoiceLibrary: invoiceLibraryRouter,
});

export type AppRouter = typeof appRouter;
