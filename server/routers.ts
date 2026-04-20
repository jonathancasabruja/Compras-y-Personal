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

export const appRouter = router({
  personas: personasRouter,
  tarifas: tarifasRouter,
  facturas: facturasRouter,
  lotes: lotesRouter,
});

export type AppRouter = typeof appRouter;
