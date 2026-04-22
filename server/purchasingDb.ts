/**
 * Purchasing module — server-side DB helpers ported from brewery_dashboard.
 *
 * Covers Órdenes de Compra + Fletes y Gastos (cost invoices) + supplier
 * product mappings. These tables live in the shared Supabase DB; brewery
 * retains read-only access until Phase 2.
 *
 * NOT ported yet (live in brewery.casabruja.com until Phase 2):
 *   - receivePurchaseOrder / previewReceive / reversePurchaseOrder → they
 *     touch raw_materials + stock_movements which aren't modelled here.
 *     Compras exposes receive() as a status-only transition for now;
 *     inventory writes continue through brewery's existing endpoint.
 *   - extractInvoice (AI PDF extraction) — requires BUILT_IN_FORGE_API_*
 *     env vars + patchedFetch setup. Port when/if the UI needs it.
 *   - exportPdf (HTML→PDF) — client-side today.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  purchaseOrders,
  purchaseOrderItems,
  purchaseOrderExtraCosts,
  purchaseOrderAttachments,
  costInvoices,
  costInvoiceAllocations,
  supplierProductMappings,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type PurchaseOrderExtraCost,
  type PurchaseOrderAttachment,
  type InsertPurchaseOrder,
  type InsertPurchaseOrderItem,
  type InsertPurchaseOrderExtraCost,
  type InsertPurchaseOrderAttachment,
  type CostInvoice,
  type CostInvoiceAllocation,
  type SupplierProductMapping,
} from "../drizzle/schema";

function reqDb() {
  const db = getDb();
  if (!db) throw new Error("DB not available");
  return db;
}

// ─── Purchase Orders CRUD ──────────────────────────────────────────────────
export async function getAllPurchaseOrders(): Promise<PurchaseOrder[]> {
  const db = reqDb();
  return db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt));
}

export async function getPurchaseOrderById(id: number): Promise<{
  po: PurchaseOrder;
  items: PurchaseOrderItem[];
  extraCosts: PurchaseOrderExtraCost[];
  attachments: PurchaseOrderAttachment[];
} | null> {
  const db = reqDb();
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  if (!po) return null;

  const items = await db.select().from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, id))
    .orderBy(asc(purchaseOrderItems.id));
  const extraCosts = await db.select().from(purchaseOrderExtraCosts)
    .where(eq(purchaseOrderExtraCosts.purchaseOrderId, id))
    .orderBy(asc(purchaseOrderExtraCosts.id));
  const attachments = await db.select().from(purchaseOrderAttachments)
    .where(eq(purchaseOrderAttachments.purchaseOrderId, id))
    .orderBy(asc(purchaseOrderAttachments.id));

  return { po, items, extraCosts, attachments };
}

export async function getNextPoNumber(): Promise<string> {
  const db = reqDb();
  const rows = await db.select({ poNumber: purchaseOrders.poNumber })
    .from(purchaseOrders)
    .orderBy(desc(purchaseOrders.id))
    .limit(50);

  // Find the highest numeric suffix across recent POs (formats: PO-001, PO-23, etc.)
  let max = 0;
  for (const r of rows) {
    const m = /^PO-(\d+)$/i.exec(r.poNumber || "");
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  const next = max + 1;
  return `PO-${String(next).padStart(3, "0")}`;
}

export async function createPurchaseOrder(
  data: Omit<InsertPurchaseOrder, "id" | "createdAt" | "updatedAt">,
  items: Omit<InsertPurchaseOrderItem, "id" | "purchaseOrderId" | "createdAt" | "updatedAt">[],
  extraCosts: Omit<InsertPurchaseOrderExtraCost, "id" | "purchaseOrderId" | "createdAt" | "updatedAt">[]
): Promise<PurchaseOrder | null> {
  const db = reqDb();
  const [po] = await db.insert(purchaseOrders).values(data).returning();
  if (!po) return null;

  if (items.length > 0) {
    await db.insert(purchaseOrderItems).values(
      items.map((item) => ({ ...item, purchaseOrderId: po.id }))
    );
  }
  if (extraCosts.length > 0) {
    await db.insert(purchaseOrderExtraCosts).values(
      extraCosts.map((ec) => ({ ...ec, purchaseOrderId: po.id }))
    );
  }

  await calculateAndSaveLandedCosts(po.id);
  return po;
}

export async function updatePurchaseOrder(
  id: number,
  data: Partial<Omit<InsertPurchaseOrder, "id" | "createdAt">>,
  items?: Omit<InsertPurchaseOrderItem, "id" | "purchaseOrderId" | "createdAt" | "updatedAt">[],
  extraCosts?: Omit<InsertPurchaseOrderExtraCost, "id" | "purchaseOrderId" | "createdAt" | "updatedAt">[]
): Promise<PurchaseOrder | null> {
  const db = reqDb();
  const [po] = await db.update(purchaseOrders)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, id))
    .returning();
  if (!po) return null;

  if (items !== undefined) {
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));
    if (items.length > 0) {
      await db.insert(purchaseOrderItems).values(
        items.map((item) => ({ ...item, purchaseOrderId: id }))
      );
    }
  }

  if (extraCosts !== undefined) {
    // Only replace user-entered extras. Extras created from cost-invoice
    // allocations are linked via costInvoiceAllocationId and must not be
    // wiped out on PO edits — otherwise the allocations on the cost-invoice
    // side get orphaned.
    await db.delete(purchaseOrderExtraCosts).where(
      and(
        eq(purchaseOrderExtraCosts.purchaseOrderId, id),
        sql`${purchaseOrderExtraCosts.costInvoiceAllocationId} IS NULL`,
      ),
    );
    if (extraCosts.length > 0) {
      await db.insert(purchaseOrderExtraCosts).values(
        extraCosts.map((ec) => ({ ...ec, purchaseOrderId: id }))
      );
    }
  }

  await calculateAndSaveLandedCosts(id);
  return po;
}

export async function deletePurchaseOrder(id: number): Promise<boolean> {
  const db = reqDb();
  // Guard: refuse to delete if cost-invoice allocations point at this PO —
  // deleting would leave those allocations dangling. User must deallocate
  // first in the Fletes y Gastos screen.
  const allocs = await db.select({ id: costInvoiceAllocations.id })
    .from(costInvoiceAllocations)
    .where(eq(costInvoiceAllocations.purchaseOrderId, id));
  if (allocs.length > 0) {
    throw new Error(
      `No se puede eliminar: esta OC tiene ${allocs.length} asignación(es) de Fletes y Gastos. Desasígnalas primero.`,
    );
  }
  await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));
  await db.delete(purchaseOrderExtraCosts).where(eq(purchaseOrderExtraCosts.purchaseOrderId, id));
  await db.delete(purchaseOrderAttachments).where(eq(purchaseOrderAttachments.purchaseOrderId, id));
  await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  return true;
}

// ─── PO: Calculate Landed Costs ─────────────────────────────────────────────
export async function calculateAndSaveLandedCosts(poId: number): Promise<void> {
  const db = reqDb();

  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
  if (!po) return;

  const items = await db.select().from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, poId));
  const extras = await db.select().from(purchaseOrderExtraCosts)
    .where(eq(purchaseOrderExtraCosts.purchaseOrderId, poId));

  if (items.length === 0) return;

  const exchangeRate = po.exchangeRate || 1;

  // Recalculate baseTotalCost for each item first
  for (const item of items) {
    const baseTotalCost = (item.baseCostPerUnit || 0) * (item.qty || 0);
    item.baseTotalCost = baseTotalCost;
  }

  const totalQty = items.reduce((s, i) => s + (i.qty || 0), 0);
  const totalWeight = items.reduce((s, i) => s + (i.weightKg || i.qty || 0), 0);
  const totalVolume = items.reduce((s, i) => s + (i.volumeL || 0), 0);
  const totalValue = items.reduce((s, i) => s + (i.baseTotalCost || 0), 0);

  for (const item of items) {
    let allocatedExtra = 0;
    const breakdown: Array<{
      costType: string;
      description: string;
      amount: number;
      perUnit: number;
      pctByKg: number;
    }> = [];

    for (const ec of extras) {
      const amount = ec.amount || 0;
      let allocated = 0;
      let pctByKg = 0;
      const itemWeight = item.weightKg || item.qty || 0;

      switch (ec.allocationMethod) {
        case "by_qty":
          allocated = totalQty > 0 ? (amount * (item.qty || 0)) / totalQty : 0;
          pctByKg = totalQty > 0 ? ((item.qty || 0) / totalQty) * 100 : 0;
          break;
        case "by_weight":
          allocated = totalWeight > 0 ? (amount * itemWeight) / totalWeight : 0;
          pctByKg = totalWeight > 0 ? (itemWeight / totalWeight) * 100 : 0;
          break;
        case "by_volume":
          allocated = totalVolume > 0 ? (amount * (item.volumeL || 0)) / totalVolume : 0;
          pctByKg = totalVolume > 0 ? ((item.volumeL || 0) / totalVolume) * 100 : 0;
          break;
        case "by_value":
          allocated = totalValue > 0 ? (amount * (item.baseTotalCost || 0)) / totalValue : 0;
          pctByKg = totalValue > 0 ? ((item.baseTotalCost || 0) / totalValue) * 100 : 0;
          break;
        case "fixed_manual":
          allocated = amount / items.length;
          pctByKg = items.length > 0 ? 100 / items.length : 0;
          break;
      }

      allocatedExtra += allocated;
      breakdown.push({
        costType: ec.costType,
        description: ec.description || ec.costType,
        amount: Math.round(allocated * 100) / 100,
        perUnit: item.qty ? Math.round((allocated / item.qty) * 10000) / 10000 : 0,
        pctByKg: Math.round(pctByKg * 100) / 100,
      });
    }

    const baseTotalCost = item.baseTotalCost || 0;
    const landedTotalCost = baseTotalCost + allocatedExtra;
    const landedCostPerUnit = item.qty ? landedTotalCost / item.qty : 0;
    const allocatedExtraCostPerUnit = item.qty ? allocatedExtra / item.qty : 0;
    const landedCostLocal = landedTotalCost * exchangeRate;
    const landedCostPerUnitLocal = landedCostPerUnit * exchangeRate;

    await db.update(purchaseOrderItems)
      .set({
        baseTotalCost: Math.round(baseTotalCost * 100) / 100,
        allocatedExtraCosts: Math.round(allocatedExtra * 100) / 100,
        allocatedExtraCostPerUnit: Math.round(allocatedExtraCostPerUnit * 10000) / 10000,
        extraCostBreakdown: JSON.stringify(breakdown),
        landedTotalCost: Math.round(landedTotalCost * 100) / 100,
        landedCostPerUnit: Math.round(landedCostPerUnit * 10000) / 10000,
        landedCostLocal: Math.round(landedCostLocal * 100) / 100,
        landedCostPerUnitLocal: Math.round(landedCostPerUnitLocal * 10000) / 10000,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrderItems.id, item.id));
  }

  const updatedItems = await db.select().from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, poId));
  const totalBaseCost = updatedItems.reduce((s, i) => s + (i.baseTotalCost || 0), 0);
  const totalLandedCost = updatedItems.reduce((s, i) => s + (i.landedTotalCost || 0), 0);
  await db.update(purchaseOrders)
    .set({
      totalCost: Math.round(totalBaseCost * 100) / 100,
      totalLandedCost: Math.round(totalLandedCost * 100) / 100,
      updatedAt: new Date(),
    })
    .where(eq(purchaseOrders.id, poId));
}

// ─── PO: Status transitions (no inventory side-effects) ─────────────────────
// NOTE: Real receive/reverse (stock_movements + raw_materials updates) still
// runs via brewery.casabruja.com for now. Compras can flip status to
// "ordered" or "approved" freely, but receiving physically creates inventory
// in brewery's DB until Phase 1e brings that logic over.
export async function setPurchaseOrderStatus(
  poId: number,
  status: "draft" | "ordered" | "received" | "approved",
  receivedDate?: string | null,
): Promise<void> {
  const db = reqDb();
  const patch: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === "received" && receivedDate) patch.receivedDate = receivedDate;
  await db.update(purchaseOrders).set(patch).where(eq(purchaseOrders.id, poId));
}

// ─── PO: Attachments ────────────────────────────────────────────────────────
export async function addPoAttachment(
  data: Omit<InsertPurchaseOrderAttachment, "id" | "uploadedAt">,
): Promise<PurchaseOrderAttachment | null> {
  const db = reqDb();
  const [row] = await db.insert(purchaseOrderAttachments).values(data).returning();
  return row || null;
}

export async function deletePoAttachment(id: number): Promise<void> {
  const db = reqDb();
  await db.delete(purchaseOrderAttachments).where(eq(purchaseOrderAttachments.id, id));
}

export async function getPoAttachment(id: number): Promise<PurchaseOrderAttachment | null> {
  const db = reqDb();
  const [row] = await db.select().from(purchaseOrderAttachments)
    .where(eq(purchaseOrderAttachments.id, id));
  return row || null;
}

export async function getPoAttachments(purchaseOrderId: number): Promise<PurchaseOrderAttachment[]> {
  const db = reqDb();
  return db.select().from(purchaseOrderAttachments)
    .where(eq(purchaseOrderAttachments.purchaseOrderId, purchaseOrderId))
    .orderBy(asc(purchaseOrderAttachments.id));
}

// ─── Extraction context helpers ─────────────────────────────────────────────
// Feed the AI extractor authoritative catalog data (raw materials + learned
// supplier mappings) so it outputs brewery-canonical codes instead of
// hallucinating. These tables live in the shared Supabase DB but are owned
// by brewery — we only read.

export type CatalogRow = {
  productCode: string;
  name: string;
  category: string;
  unit: string;
  supplier: string | null;
};

export async function listCatalogForExtraction(): Promise<CatalogRow[]> {
  const db = reqDb();
  const rows = await db.execute(sql`
    SELECT
      product_code AS "productCode",
      name,
      category::text AS category,
      unit::text AS unit,
      supplier
    FROM raw_materials
    WHERE product_code IS NOT NULL AND product_code <> ''
    ORDER BY category, product_code
  `);
  return rows as unknown as CatalogRow[];
}

export type SupplierMappingHint = {
  supplierName: string;
  supplierDescription: string;
  internalProductCode: string;
  timesUsed: number;
};

export async function listSupplierMappingsForExtraction(): Promise<SupplierMappingHint[]> {
  const db = reqDb();
  const rows = await db.select({
    supplierName: supplierProductMappings.supplierName,
    supplierDescription: supplierProductMappings.supplierDescription,
    internalProductCode: supplierProductMappings.internalProductCode,
    timesUsed: supplierProductMappings.timesUsed,
  })
    .from(supplierProductMappings)
    .orderBy(desc(supplierProductMappings.timesUsed));
  return rows;
}

// ─── Supplier Product Mappings ──────────────────────────────────────────────
export async function getSupplierProductMappings(
  supplierName?: string,
): Promise<SupplierProductMapping[]> {
  const db = reqDb();
  if (supplierName) {
    return db.select().from(supplierProductMappings)
      .where(eq(supplierProductMappings.supplierName, supplierName))
      .orderBy(desc(supplierProductMappings.timesUsed));
  }
  return db.select().from(supplierProductMappings)
    .orderBy(desc(supplierProductMappings.timesUsed));
}

export async function upsertSupplierProductMapping(
  supplierName: string,
  supplierDescription: string,
  internalProductCode: string,
): Promise<SupplierProductMapping | null> {
  const db = reqDb();
  const [existing] = await db.select().from(supplierProductMappings)
    .where(
      and(
        eq(supplierProductMappings.supplierName, supplierName),
        eq(supplierProductMappings.supplierDescription, supplierDescription),
      ),
    );

  if (existing) {
    const [row] = await db.update(supplierProductMappings)
      .set({
        internalProductCode,
        timesUsed: existing.timesUsed + 1,
        updatedAt: new Date(),
      })
      .where(eq(supplierProductMappings.id, existing.id))
      .returning();
    return row || null;
  }

  const [row] = await db.insert(supplierProductMappings).values({
    supplierName,
    supplierDescription,
    internalProductCode,
  }).returning();
  return row || null;
}

export async function learnSupplierMappings(
  supplier: string,
  items: Array<{ productCode: string; productDescription?: string | null }>,
): Promise<void> {
  if (!supplier) return;
  for (const item of items) {
    if (item.productCode && item.productDescription) {
      await upsertSupplierProductMapping(supplier, item.productDescription, item.productCode);
    }
  }
}

// ─── UOM Normalization Helpers ──────────────────────────────────────────────
// Standard brewery weight conversions (lbs → kg, rounded to standard bag sizes)
const LBS_TO_KG_STANDARD: Record<number, number> = {
  44: 20,
  22: 10,
  11: 5,
  55: 25,
  33: 15,
  1: 0.4536,
};

export function normalizeLbsToKg(lbs: number): number {
  if (LBS_TO_KG_STANDARD[lbs] !== undefined) return LBS_TO_KG_STANDARD[lbs];
  return Math.round(lbs * 0.453592 * 100) / 100;
}

export function normalizeUom(qty: number, uom: string): {
  normalizedQty: number;
  normalizedUnit: string;
  supplierQty: number;
  supplierUom: string;
} {
  const uomLower = (uom || "").toLowerCase().trim();
  if (uomLower === "lb" || uomLower === "lbs" || uomLower === "pound" || uomLower === "pounds") {
    return {
      normalizedQty: normalizeLbsToKg(qty),
      normalizedUnit: "kg",
      supplierQty: qty,
      supplierUom: uom,
    };
  }
  if (uomLower === "oz" || uomLower === "ounce" || uomLower === "ounces") {
    return {
      normalizedQty: Math.round(qty * 0.0283495 * 100) / 100,
      normalizedUnit: "kg",
      supplierQty: qty,
      supplierUom: uom,
    };
  }
  if (uomLower === "g" || uomLower === "gram" || uomLower === "grams") {
    return {
      normalizedQty: Math.round(qty / 10) / 100,
      normalizedUnit: "kg",
      supplierQty: qty,
      supplierUom: uom,
    };
  }
  return {
    normalizedQty: qty,
    normalizedUnit: uom || "kg",
    supplierQty: qty,
    supplierUom: uom,
  };
}

// ─── Cost Invoices (Pool — "Fletes y Gastos") ───────────────────────────────
export async function getAllCostInvoices(): Promise<CostInvoice[]> {
  const db = reqDb();
  return db.select().from(costInvoices).orderBy(desc(costInvoices.createdAt));
}

export async function getCostInvoiceById(id: number): Promise<{
  invoice: CostInvoice;
  allocations: (CostInvoiceAllocation & { poNumber?: string })[];
} | null> {
  const db = reqDb();
  const rows = await db.select().from(costInvoices).where(eq(costInvoices.id, id));
  if (rows.length === 0) return null;
  const invoice = rows[0];
  const allocs = await db.select().from(costInvoiceAllocations)
    .where(eq(costInvoiceAllocations.costInvoiceId, id));
  const allocsWithPo = await Promise.all(allocs.map(async (a) => {
    const poRows = await db.select({ poNumber: purchaseOrders.poNumber })
      .from(purchaseOrders).where(eq(purchaseOrders.id, a.purchaseOrderId));
    return { ...a, poNumber: poRows[0]?.poNumber || `PO #${a.purchaseOrderId}` };
  }));
  return { invoice, allocations: allocsWithPo };
}

export async function createCostInvoice(data: {
  invoiceNumber: string;
  supplier: string;
  costType: string;
  date: string;
  totalAmount: number;
  currency?: string;
  pdfUrl?: string | null;
  pdfFileName?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}): Promise<CostInvoice | null> {
  const db = reqDb();
  const rows = await db.insert(costInvoices).values({
    ...data,
    currency: data.currency || "USD",
    allocatedAmount: 0,
    remainingAmount: data.totalAmount,
  }).returning();
  return rows[0] || null;
}

export async function updateCostInvoice(
  id: number,
  data: Partial<{
    invoiceNumber: string;
    supplier: string;
    costType: string;
    date: string;
    totalAmount: number;
    currency: string;
    pdfUrl: string | null;
    pdfFileName: string | null;
    notes: string | null;
  }>,
): Promise<CostInvoice | null> {
  const db = reqDb();
  if (data.totalAmount !== undefined) {
    const existing = await db.select().from(costInvoices).where(eq(costInvoices.id, id));
    if (existing.length === 0) return null;
    const oldAllocated = existing[0].allocatedAmount;
    const newRemaining = data.totalAmount - oldAllocated;
    if (newRemaining < 0) {
      throw new Error("El nuevo monto total es menor que el monto ya asignado");
    }
    const rows = await db.update(costInvoices).set({
      ...data,
      remainingAmount: newRemaining,
      updatedAt: new Date(),
    }).where(eq(costInvoices.id, id)).returning();
    return rows[0] || null;
  }
  const rows = await db.update(costInvoices).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(costInvoices.id, id)).returning();
  return rows[0] || null;
}

export async function deleteCostInvoice(id: number): Promise<boolean> {
  const db = reqDb();
  const allocs = await db.select().from(costInvoiceAllocations)
    .where(eq(costInvoiceAllocations.costInvoiceId, id));
  if (allocs.length > 0) {
    throw new Error(
      "No se puede eliminar: esta factura tiene asignaciones a OC. Desasígnalas primero.",
    );
  }
  await db.delete(costInvoices).where(eq(costInvoices.id, id));
  return true;
}

export async function allocateCostInvoice(
  costInvoiceId: number,
  purchaseOrderId: number,
  percentage: number | null,
  amount: number | null,
  notes?: string | null,
  exchangeRate?: number | null,
): Promise<CostInvoiceAllocation | null> {
  const db = reqDb();

  const invoiceRows = await db.select().from(costInvoices).where(eq(costInvoices.id, costInvoiceId));
  if (invoiceRows.length === 0) throw new Error("Factura de costo no encontrada");
  const invoice = invoiceRows[0];

  const poRows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId));
  if (poRows.length === 0) throw new Error("Orden de compra no encontrada");
  const po = poRows[0];

  let allocatedAmount: number;
  let effectivePercentage: number;

  if (amount && amount > 0) {
    allocatedAmount = Math.round(amount * 100) / 100;
    effectivePercentage = Math.round((amount / invoice.totalAmount * 100) * 100) / 100;
  } else if (percentage && percentage > 0) {
    effectivePercentage = percentage;
    allocatedAmount = Math.round((invoice.totalAmount * percentage / 100) * 100) / 100;
  } else {
    throw new Error("Debe proveer un porcentaje o un monto");
  }

  const existingAllocs = await db.select().from(costInvoiceAllocations)
    .where(eq(costInvoiceAllocations.costInvoiceId, costInvoiceId));
  const totalExistingPct = existingAllocs.reduce((sum, a) => sum + a.percentage, 0);
  if (totalExistingPct + effectivePercentage > 100.01) {
    throw new Error(
      `No se puede asignar ${effectivePercentage.toFixed(2)}%. Ya hay ${totalExistingPct.toFixed(2)}% asignado; sólo queda ${(100 - totalExistingPct).toFixed(2)}%.`,
    );
  }

  if (allocatedAmount > invoice.remainingAmount + 0.01) {
    throw new Error(
      `No se puede asignar ${allocatedAmount.toFixed(2)}. Sólo quedan ${invoice.remainingAmount.toFixed(2)}.`,
    );
  }

  const sourceCurrency = invoice.currency || "USD";
  const targetCurrency = po.currency || "USD";
  const needsConversion = sourceCurrency !== targetCurrency;
  const rate = needsConversion ? (exchangeRate || 1) : 1;
  const convertedAmount = Math.round((allocatedAmount * rate) * 100) / 100;

  const allocRows = await db.insert(costInvoiceAllocations).values({
    costInvoiceId,
    purchaseOrderId,
    percentage: effectivePercentage,
    allocatedAmount,
    sourceCurrency,
    targetCurrency,
    exchangeRate: rate,
    convertedAmount,
    notes: notes || null,
  }).returning();

  const newAllocated = Math.round((invoice.allocatedAmount + allocatedAmount) * 100) / 100;
  const newRemaining = Math.round((invoice.totalAmount - newAllocated) * 100) / 100;
  await db.update(costInvoices).set({
    allocatedAmount: newAllocated,
    remainingAmount: newRemaining,
    updatedAt: new Date(),
  }).where(eq(costInvoices.id, costInvoiceId));

  const descParts = [`${invoice.invoiceNumber} (${effectivePercentage.toFixed(1)}%)`];
  if (needsConversion) {
    descParts.push(`[${sourceCurrency}→${targetCurrency} @${rate}]`);
  }
  await db.insert(purchaseOrderExtraCosts).values({
    purchaseOrderId,
    costType: invoice.costType,
    description: descParts.join(" "),
    amount: convertedAmount,
    allocationMethod: "by_weight",
    costInvoiceId,
    costInvoiceAllocationId: allocRows[0].id,
    costInvoiceRef: invoice.invoiceNumber,
    allocationPercentage: effectivePercentage,
  });

  await calculateAndSaveLandedCosts(purchaseOrderId);

  return allocRows[0] || null;
}

export async function deallocateCostInvoice(allocationId: number): Promise<boolean> {
  const db = reqDb();

  const allocRows = await db.select().from(costInvoiceAllocations)
    .where(eq(costInvoiceAllocations.id, allocationId));
  if (allocRows.length === 0) throw new Error("Asignación no encontrada");
  const alloc = allocRows[0];

  const invoiceRows = await db.select().from(costInvoices).where(eq(costInvoices.id, alloc.costInvoiceId));
  if (invoiceRows.length === 0) throw new Error("Factura de costo no encontrada");
  const invoice = invoiceRows[0];

  await db.delete(purchaseOrderExtraCosts).where(eq(purchaseOrderExtraCosts.costInvoiceAllocationId, allocationId));
  await db.delete(costInvoiceAllocations).where(eq(costInvoiceAllocations.id, allocationId));

  const newAllocated = Math.round((invoice.allocatedAmount - alloc.allocatedAmount) * 100) / 100;
  const newRemaining = Math.round((invoice.totalAmount - newAllocated) * 100) / 100;
  await db.update(costInvoices).set({
    allocatedAmount: Math.max(0, newAllocated),
    remainingAmount: Math.max(0, newRemaining),
    updatedAt: new Date(),
  }).where(eq(costInvoices.id, alloc.costInvoiceId));

  await calculateAndSaveLandedCosts(alloc.purchaseOrderId);
  return true;
}

export async function getCostInvoiceAllocationsForPo(
  purchaseOrderId: number,
): Promise<(CostInvoiceAllocation & {
  invoiceNumber: string;
  supplier: string;
  costType: string;
  totalAmount: number;
  invoiceCurrency: string;
})[]> {
  const db = reqDb();
  const allocs = await db.select().from(costInvoiceAllocations)
    .where(eq(costInvoiceAllocations.purchaseOrderId, purchaseOrderId));
  return Promise.all(allocs.map(async (a) => {
    const inv = await db.select().from(costInvoices).where(eq(costInvoices.id, a.costInvoiceId));
    return {
      ...a,
      invoiceNumber: inv[0]?.invoiceNumber || "",
      supplier: inv[0]?.supplier || "",
      costType: inv[0]?.costType || "",
      totalAmount: inv[0]?.totalAmount || 0,
      invoiceCurrency: inv[0]?.currency || "USD",
    };
  }));
}
