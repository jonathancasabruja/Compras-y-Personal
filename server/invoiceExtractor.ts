/**
 * AI-powered PDF extraction for purchase orders and cost invoices.
 *
 * Uses the official OpenAI SDK directly (not the Vercel AI SDK — see
 * earlier attempt, which ran into API shape drift across ai v4 ↔ v5 ↔ v6).
 * The OpenAI chat-completions API natively supports PDF inputs via the
 * `file` content type with a base64 data-URL, and structured output via
 * `response_format: json_schema` with strict mode.
 *
 * Env: OPENAI_API_KEY. If unset, both exported extract* functions throw
 * with a friendly Spanish error that the UI surfaces to the user.
 */

import OpenAI from "openai";

export function isExtractorConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

function client(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY no configurada — la extracción automática de PDF está deshabilitada. " +
        "Configura la variable en Railway (puedes copiarla de facturacion-cb).",
    );
  }
  return new OpenAI({ apiKey });
}

function toDataUrl(b64: string): string {
  const clean = b64.replace(/^data:application\/pdf;base64,/, "");
  return `data:application/pdf;base64,${clean}`;
}

// ─── Purchase Order extractor ───────────────────────────────────────────────

export type ExtractedPo = {
  supplier: string;
  invoiceNumber: string;
  date: string;
  currency: string;
  paymentTerms: string | null;
  totalAmount: number;
  items: Array<{
    productCode: string;
    productDescription: string;
    qty: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    lotNumber: string | null;
  }>;
  extraCosts: Array<{
    costType: string;
    description: string;
    amount: number;
  }>;
};

const PO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    supplier: { type: "string" },
    invoiceNumber: { type: "string" },
    date: { type: "string", description: "YYYY-MM-DD" },
    currency: { type: "string" },
    paymentTerms: { type: ["string", "null"] },
    totalAmount: { type: "number" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          productCode: { type: "string" },
          productDescription: { type: "string" },
          qty: { type: "number" },
          unit: { type: "string" },
          unitPrice: { type: "number" },
          totalPrice: { type: "number" },
          lotNumber: { type: ["string", "null"] },
        },
        required: [
          "productCode",
          "productDescription",
          "qty",
          "unit",
          "unitPrice",
          "totalPrice",
          "lotNumber",
        ],
      },
    },
    extraCosts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          costType: { type: "string" },
          description: { type: "string" },
          amount: { type: "number" },
        },
        required: ["costType", "description", "amount"],
      },
    },
  },
  required: [
    "supplier",
    "invoiceNumber",
    "date",
    "currency",
    "paymentTerms",
    "totalAmount",
    "items",
    "extraCosts",
  ],
} as const;

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

If a field is not present, return an empty string for strings and 0 for numbers. Return date in YYYY-MM-DD. For fields required to be string-or-null, use null explicitly when unknown.`;

export async function extractPoFromPdf(dataBase64: string): Promise<ExtractedPo> {
  const openai = client();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "file",
            file: {
              filename: "invoice.pdf",
              file_data: toDataUrl(dataBase64),
            },
          } as unknown as OpenAI.Chat.ChatCompletionContentPart,
          { type: "text", text: PO_PROMPT },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "po_extraction",
        strict: true,
        schema: PO_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("El modelo no devolvió contenido");

  const parsed = JSON.parse(content) as ExtractedPo;

  // Post-process unit normalization (same heuristics as brewery)
  const lbsWeights = new Set([11, 22, 33, 44, 55]);
  return {
    ...parsed,
    items: parsed.items.map((item) => {
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

// ─── Cost Invoice extractor ────────────────────────────────────────────────

export type ExtractedCostInvoice = {
  invoiceNumber: string;
  supplier: string;
  date: string;
  totalAmount: number;
  currency: string;
  costType: "freight" | "customs" | "insurance" | "handling" | "logistics" | "comisiones" | "other";
  notes: string | null;
};

const COST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    invoiceNumber: { type: "string" },
    supplier: { type: "string" },
    date: { type: "string", description: "YYYY-MM-DD" },
    totalAmount: { type: "number" },
    currency: { type: "string" },
    costType: {
      type: "string",
      enum: ["freight", "customs", "insurance", "handling", "logistics", "comisiones", "other"],
    },
    notes: { type: ["string", "null"] },
  },
  required: ["invoiceNumber", "supplier", "date", "totalAmount", "currency", "costType", "notes"],
} as const;

const COST_PROMPT = `Extract data from this COST INVOICE PDF (freight, customs, insurance, or logistics invoice).

This is NOT a product/supplier invoice — it's a separate cost document from a freight forwarder, customs broker, logistics company, or commission agent.

Rules:
- Classify costType as one of: freight, customs, insurance, handling, logistics, comisiones, other.
- Look for the GRAND TOTAL / AMOUNT DUE — not line subtotals.
- Date in YYYY-MM-DD.
- Currency is usually USD or GTQ for Panama imports.
- If notes are present (BL number, container number, shipment ref), capture them; otherwise use null.`;

export async function extractCostInvoiceFromPdf(
  dataBase64: string,
): Promise<ExtractedCostInvoice> {
  const openai = client();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "file",
            file: {
              filename: "cost-invoice.pdf",
              file_data: toDataUrl(dataBase64),
            },
          } as unknown as OpenAI.Chat.ChatCompletionContentPart,
          { type: "text", text: COST_PROMPT },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "cost_invoice_extraction",
        strict: true,
        schema: COST_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("El modelo no devolvió contenido");
  return JSON.parse(content) as ExtractedCostInvoice;
}
