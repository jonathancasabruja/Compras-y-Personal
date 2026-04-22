/**
 * Supplier Invoice Library — master repo for every PDF we receive.
 *
 * Upload flow (orchestrated by the router):
 *   1. Client compresses PDF
 *   2. Server runs AI extractor → {supplier, date, category, ...}
 *   3. Server renames the file to `{supplier}-{date}.pdf` and uploads to
 *      Supabase Storage under `invoices/<category>/<filename>`
 *   4. Insert row with extractedData + file URLs
 *
 * After upload the invoice sits in the library. The user can filter by
 * category, edit the category (marks it as manual so later auto-rules
 * don't clobber it), link it to an OC or Fletes row, or delete it.
 */

import { and, desc, eq, ilike, or } from "drizzle-orm";
import { getDb } from "./db";
import {
  supplierInvoices,
  type SupplierInvoice,
  type InsertSupplierInvoice,
} from "../drizzle/schema";
import type { InvoiceCategory } from "./invoiceExtractor";

function reqDb() {
  const db = getDb();
  if (!db) throw new Error("DB not available");
  return db;
}

export async function listSupplierInvoices(opts: {
  category?: InvoiceCategory;
  search?: string;
  unlinkedOnly?: boolean;
  limit?: number;
} = {}): Promise<SupplierInvoice[]> {
  const db = reqDb();
  const conds = [] as any[];
  if (opts.category) conds.push(eq(supplierInvoices.category, opts.category));
  if (opts.search && opts.search.trim()) {
    const needle = `%${opts.search.trim()}%`;
    conds.push(
      or(
        ilike(supplierInvoices.supplier, needle),
        ilike(supplierInvoices.invoiceNumber, needle),
        ilike(supplierInvoices.briefDescription, needle),
        ilike(supplierInvoices.storedFilename, needle),
      ) as any,
    );
  }
  // When picking from the library to create an OC, usually we want only
  // invoices that aren't already attached to another one. That's the
  // unlinkedOnly mode. The library view itself shows everything.
  if (opts.unlinkedOnly) {
    conds.push(eq(supplierInvoices.usedInPoId, null as any) as any);
  }
  const query = db.select().from(supplierInvoices)
    .orderBy(desc(supplierInvoices.uploadedAt))
    .limit(opts.limit ?? 500);
  const rows = await (conds.length ? query.where(and(...conds)) : query);
  return rows;
}

export async function countByCategory(): Promise<Record<string, number>> {
  const db = reqDb();
  const rows = await db.select().from(supplierInvoices);
  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.category] = (counts[r.category] ?? 0) + 1;
  }
  counts.all = rows.length;
  return counts;
}

export async function getSupplierInvoice(id: number): Promise<SupplierInvoice | null> {
  const db = reqDb();
  const [row] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, id));
  return row ?? null;
}

export async function createSupplierInvoice(
  data: Omit<InsertSupplierInvoice, "id" | "uploadedAt" | "updatedAt">,
): Promise<SupplierInvoice | null> {
  const db = reqDb();
  const [row] = await db.insert(supplierInvoices).values(data).returning();
  return row ?? null;
}

export async function updateSupplierInvoice(
  id: number,
  patch: Partial<Omit<InsertSupplierInvoice, "id" | "uploadedAt">>,
): Promise<SupplierInvoice | null> {
  const db = reqDb();
  const [row] = await db.update(supplierInvoices)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(supplierInvoices.id, id))
    .returning();
  return row ?? null;
}

export async function deleteSupplierInvoice(id: number): Promise<SupplierInvoice | null> {
  const db = reqDb();
  const [row] = await db.delete(supplierInvoices).where(eq(supplierInvoices.id, id)).returning();
  return row ?? null;
}

export async function linkInvoiceToPo(
  invoiceId: number,
  poId: number | null,
): Promise<void> {
  const db = reqDb();
  await db.update(supplierInvoices)
    .set({ usedInPoId: poId, updatedAt: new Date() })
    .where(eq(supplierInvoices.id, invoiceId));
}

export async function linkInvoiceToCostInvoice(
  invoiceId: number,
  costInvoiceId: number | null,
): Promise<void> {
  const db = reqDb();
  await db.update(supplierInvoices)
    .set({ usedInCostInvoiceId: costInvoiceId, updatedAt: new Date() })
    .where(eq(supplierInvoices.id, invoiceId));
}
