/**
 * AI-powered PDF extraction for purchase orders and cost invoices.
 *
 * Unlike brewery_dashboard (which pipes through the Manus forge proxy with
 * Gemini), Compras hits the OpenAI API directly with gpt-4o-mini. This
 * avoids the forge env vars we don't have on Railway — all we need is
 * OPENAI_API_KEY.
 *
 * The client uploads a base64 PDF through tRPC (10 MB Express JSON limit,
 * 8 MB client guardrail), and we pass it to the model as a `file` content
 * part. No Manus storage needed — the PDF is parsed in-memory and
 * discarded.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

export function isExtractorConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

function client() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY not set — la extracción automática de PDF está deshabilitada. " +
        "Configura la variable en Railway (puedes copiarla de facturacion-cb).",
    );
  }
  return createOpenAI({ apiKey });
}

function b64ToDataUrl(b64: string): string {
  const clean = b64.replace(/^data:application\/pdf;base64,/, "");
  return `data:application/pdf;base64,${clean}`;
}

// ─── Purchase Order extractor ───────────────────────────────────────────────

const poSchema = z.object({
  supplier: z.string().describe("Supplier/vendor name"),
  invoiceNumber: z.string().describe("Invoice or PO number"),
  date: z.string().describe("Invoice date in YYYY-MM-DD format"),
  currency: z.string().describe("Currency code like USD, EUR, GTQ"),
  paymentTerms: z.string().nullable().describe("Payment terms if visible"),
  totalAmount: z.number().describe("Total invoice amount"),
  items: z.array(
    z.object({
      productCode: z.string().describe("Product code or identifier"),
      productDescription: z.string().describe("Product description"),
      qty: z.number().describe("Quantity (WEIGHT when applicable — LBS/KG)"),
      unit: z.string().describe("Unit of measure (LBS, KG, each, etc.)"),
      unitPrice: z.number().describe("Price per unit"),
      totalPrice: z.number().describe("Line total"),
      lotNumber: z.string().nullable().describe("Lot number if present (e.g. P91-JUCIT9059)"),
    }),
  ),
  extraCosts: z.array(
    z.object({
      costType: z.string().describe("freight / shipping / customs / handling / other"),
      description: z.string(),
      amount: z.number(),
    }),
  ),
});

export type ExtractedPo = z.infer<typeof poSchema>;

const PO_PROMPT = `Extract data from this supplier invoice / purchase order PDF for a BREWERY in Panama (Casa Bruja).

CRITICAL RULES:
1. QUANTITY is WEIGHT in LBS or KG for raw materials (hops, malt, yeast). Look for columns like "Stock Qty", "Net Weight", or values ending in "LBS"/"KG" (e.g. "44.0LBS", "22.0 LBS").
   - NEVER use pack/carton counts ("1.0 CAR", "2 packs") as quantity for raw materials.
   - Common hop weights: 44 LBS, 22 LBS, 11 LBS, 55 LBS.
   - For packaging materials (bottles, cans, labels) qty is unit count — that's fine.
2. UNIT must ALWAYS be "LBS" when the weight is in pounds. If you see "44.0LBS" → unit = "LBS".
3. UNIT PRICE: derive from line total ÷ weight qty when needed. Example: $605.05 total for 44 LBS → unitPrice = 13.7511.
4. EXTRA COSTS: freight, shipping, insurance, customs, handling, surcharges — usually at the bottom of the invoice. Labels include "Freight", "Shipping", "USA Freight", "Flete", "Handling", "Aduana", "Comision".
5. LOT NUMBERS: Values like P91-JUCIT9059, P92-JUMOS9116, 25-0058 are LOT NUMBERS (do NOT confuse with invoice numbers).
6. PRODUCT CODES: if the supplier uses their own code, pass it through. Casa Bruja's internal codes follow patterns like HOPS-CITRA, HOPS-MOSAIC, MALT-PILSNER, YEAST-US05, PACK-CAN-330, PACK-LABEL-IPA.

EXAMPLES:
- "Pellet T90, Citra - P91-JUCIT9059  1.0 CAR  44.0LBS  $605.05"
  → qty=44, unit="LBS", lotNumber="P91-JUCIT9059", totalPrice=605.05, unitPrice=13.7511
- "Hallertau Mittelfruh - 25-0058  2.0 CAR  22.0LBS  $245.24"
  → qty=22, unit="LBS", lotNumber="25-0058", totalPrice=245.24, unitPrice=11.1473
- "Freight to Panama $253.63" → extraCost: costType="freight", amount=253.63, description="Freight to Panama"

If a field is not present, return an empty string for strings and 0 for numbers. Return date in YYYY-MM-DD.`;

export async function extractPoFromPdf(dataBase64: string): Promise<ExtractedPo> {
  const openai = client();
  const { object } = await generateObject({
    model: openai.chat("gpt-4o-mini"),
    messages: [
      {
        role: "user",
        content: [
          { type: "file", data: b64ToDataUrl(dataBase64), mediaType: "application/pdf" },
          { type: "text", text: PO_PROMPT },
        ],
      },
    ],
    schema: poSchema,
  });

  // Post-process unit normalization (same heuristics brewery uses)
  const lbsWeights = new Set([11, 22, 33, 44, 55]);
  return {
    ...object,
    items: object.items.map((item) => {
      let unit = (item.unit || "").trim();
      const unitLower = unit.toLowerCase();
      if (
        (!unit || unitLower === "ea" || unitLower === "each" || unitLower === "car") &&
        lbsWeights.has(Math.round(item.qty))
      ) {
        unit = "LBS";
      }
      if (
        unitLower === "lb" ||
        unitLower === "pound" ||
        unitLower === "pounds" ||
        unitLower === "lbs." ||
        unitLower === "lb."
      ) {
        unit = "LBS";
      }
      if (
        unitLower === "kilogram" ||
        unitLower === "kilograms" ||
        unitLower === "kgs" ||
        unitLower === "kg."
      ) {
        unit = "KG";
      }
      return { ...item, unit };
    }),
  };
}

// ─── Cost Invoice extractor (freight, customs, etc.) ────────────────────────

const costInvoiceSchema = z.object({
  invoiceNumber: z.string().describe("Invoice number"),
  supplier: z.string().describe("Company name (freight forwarder, customs broker, etc.)"),
  date: z.string().describe("Invoice date in YYYY-MM-DD format"),
  totalAmount: z.number().describe("Total amount due"),
  currency: z.string().describe("Currency code (USD, EUR, GTQ, etc.)"),
  costType: z
    .enum(["freight", "customs", "insurance", "handling", "logistics", "comisiones", "other"])
    .describe("Type of cost"),
  notes: z.string().nullable().describe("Any reference numbers or notes"),
});

export type ExtractedCostInvoice = z.infer<typeof costInvoiceSchema>;

const COST_PROMPT = `Extract data from this COST INVOICE PDF (freight, customs, insurance, or logistics invoice).

This is NOT a product/supplier invoice — it's a separate cost document from a freight forwarder, customs broker, logistics company, or commission agent.

Rules:
- Classify the costType as one of: freight, customs, insurance, handling, logistics, comisiones, other.
- Look for the GRAND TOTAL / AMOUNT DUE — not line subtotals.
- Date in YYYY-MM-DD.
- Currency is usually USD or GTQ for Panama imports.
- If notes are present (BL number, container number, shipment ref), capture them.`;

export async function extractCostInvoiceFromPdf(
  dataBase64: string,
): Promise<ExtractedCostInvoice> {
  const openai = client();
  const { object } = await generateObject({
    model: openai.chat("gpt-4o-mini"),
    messages: [
      {
        role: "user",
        content: [
          { type: "file", data: b64ToDataUrl(dataBase64), mediaType: "application/pdf" },
          { type: "text", text: COST_PROMPT },
        ],
      },
    ],
    schema: costInvoiceSchema,
  });
  return object;
}
