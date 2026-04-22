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

export const INVOICE_CATEGORIES = [
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
] as const;

export type InvoiceCategory = (typeof INVOICE_CATEGORIES)[number];

export type ExtractedPo = {
  supplier: string;
  invoiceNumber: string;
  date: string;
  currency: string;
  paymentTerms: string | null;
  totalAmount: number;
  category: InvoiceCategory;
  briefDescription: string;
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
    category: {
      type: "string",
      enum: [
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
      ],
    },
    briefDescription: {
      type: "string",
      description: "Short human-readable summary (max 120 chars)",
    },
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
    "category",
    "briefDescription",
    "items",
    "extraCosts",
  ],
} as const;

const PO_PROMPT_BASE = `You are processing a business invoice for Casa Bruja, a craft brewery + taproom in Panama. The same library holds supplier purchase invoices (hops, malt, packaging), logistics (freight/customs), taproom operations (food, beverages, cleaning supplies), and overhead (electricity, internet, rent, legal). Your first job is to CLASSIFY the invoice; your second job is to extract its details.

CLASSIFICATION — pick exactly one category:
- brewing_raw_materials — INGREDIENTS that become part of the beer. Hops (pellet/T-90/whole cone), malt (base/specialty/crystal), yeast (liquid vials, dry sachets), adjuncts (honey, fruit purée, coffee, cacao, spices, lactose, oats, rice hulls), water-treatment salts added during brewing (gypsum, CaCl2).
- brewing_packaging — containers that hold finished beer for sale. Empty cans, bottles, paper labels, crowns/caps, kegs, shrink sleeves, keg collars, PakTechs, 6-pack trays/carriers, tray dividers.
- brewing_equipment — PRODUCTION EQUIPMENT and the chemicals that clean/sanitize it. Brewhouse hardware, fermenters, brite tanks, heat exchangers, pumps, valves, gaskets, clamps, tri-clamps, fittings, hose/tubing, pressure gauges, thermometers, filters & filter cartridges, sensors, motors, electrical components (PLCs, contactors), CIP chemicals (caustic, PAA/peracetic acid, Oxonia, acid anionic, San-Star, chlorinated detergents), tools used on production equipment.
  → "Repuestos", "repair parts", "refacciones", "spare parts", "replacement parts" for brewery equipment ALL land here.
- logistics — freight, shipping, customs brokerage, cargo insurance, import handling fees, line-haul, ocean/air freight.
- taproom_food — food INGREDIENTS served in the taproom kitchen (meat, seafood, vegetables, bread, cheese, sauces, condiments, spices, oils).
- taproom_beverages — drinks NOT made by Casa Bruja (wine, spirits, liquor, sodas, juice, mixers, non-alcoholic beverages for cocktails/service).
- taproom_supplies — front-of-house disposables and cleaning supplies. Napkins, paper towels, trash bags, disposable cups, wrappers, to-go containers, cleaning chemicals used in the DINING AREA (not on production equipment), hand soap, dish soap, sanitizer wipes, uniforms, aprons, glassware, coasters.
- utilities — electricity, water, gas, internet, phone, cable TV.
- services — legal, accounting, marketing, software subscriptions (SaaS), consulting, web hosting, IT, advertising.
- rent_facility — rent, security services, pest control, janitorial service contracts, building maintenance labor.
- other — anything that doesn't clearly fit the above.

DISAMBIGUATION RULES (read before choosing):
- If you see "repuesto", "refacción", "repair part", "spare part", "replacement" + any mechanical/electrical part → brewing_equipment. NEVER taproom_supplies.
- Pumps, valves, motors, bearings, gaskets, o-rings, seals, hoses, fittings, sensors, PLCs, VFDs → brewing_equipment, ALWAYS.
- Filter cartridges + filter housings → brewing_equipment (they filter beer/wort).
- Chemicals used to sanitize production equipment (Oxonia, PAA, caustic, Star San, peracetic acid, acid anionic) → brewing_equipment.
- Chemicals used to clean the bar/dining area (Pine-Sol, Fabuloso, bleach, dish soap) → taproom_supplies.
- If the supplier is a brewery-equipment vendor (Ziemann, Czech, Prospero, GW Kent, ProBrew, Ska Fab, Five Star Chemicals, Birko) → almost always brewing_equipment.
- If the supplier is a food distributor (Sysco, US Foods, Rey, Super99, Xtra) → taproom_food.
- If the supplier is a hop/malt/yeast vendor (BSG, Yakima, Hopsteiner, Lupex, Great Western, Country Malt, Weyermann, Briess, Lallemand, White Labs, Wyeast) → brewing_raw_materials.
- Electricity bills (ENSA, EDEMET, EDECHI), water bills (IDAAN), internet (Cable Onda, Más Móvil), phone (+507) → utilities.
- If a PDF has BOTH products and freight/aduana/comision line items, classify by the PRODUCTS — the freight lines go into extraCosts, not the category.

Also produce a briefDescription (max 120 chars) like "Pellet hops shipment from BSG (Citra, Mosaic)" or "ENSA electricity bill Mar 2026" or "Repuestos bomba centrífuga — Ziemann" or "IC Pan - pest control monthly".

FIELD EXTRACTION RULES (applies to all categories; blank out fields that don't apply):
1. QUANTITY is WEIGHT in LBS or KG for brewing_raw_materials (hops, malt, yeast). Look for "Stock Qty", "Net Weight", or values ending in "LBS"/"KG" (e.g. "44.0LBS").
   - NEVER use pack/carton counts ("1.0 CAR", "2 packs") as quantity for raw materials.
   - Common hop weights: 44 LBS, 22 LBS, 11 LBS, 55 LBS.
   - For packaging, taproom, utilities, services: qty is unit count or just 1. Line items are optional — utility bills typically have none.
2. UNIT must be "LBS" when the weight is in pounds.
3. UNIT PRICE: for raw materials, derive from line total ÷ weight qty. Example: $605.05 total for 44 LBS → unitPrice = 13.7511.
4. EXTRA COSTS: freight, shipping, insurance, customs, handling at the bottom of the invoice. Labels include "Freight", "Shipping", "USA Freight", "Flete", "Handling", "Aduana", "Comision". Most non-brewing invoices have no extras.
5. LOT NUMBERS: Values like P91-JUCIT9059 are LOT NUMBERS (do NOT confuse with invoice numbers).
6. PRODUCT CODES — this is the most important rule for brewing_raw_materials:
   - You will be given a CATALOG below of Casa Bruja's canonical product codes. ALWAYS match the invoice line to one of those codes when any reasonable match exists. Prefer fuzzy matching on the product name.
   - You will also be given a list of LEARNED MAPPINGS from past invoices. Use these as authoritative hints.
   - Only fall back to the supplier's raw code when nothing in the catalog matches at all.
   - For non-brewing invoices, leave productCode empty or use a human-readable label.

If a field is not present, return an empty string for strings and 0 for numbers. Return date in YYYY-MM-DD. For fields required to be string-or-null, use null explicitly when unknown.`;

export type PoExtractorContext = {
  catalog?: Array<{ productCode: string; name: string; category: string; unit: string }>;
  supplierMappings?: Array<{
    supplierName: string;
    supplierDescription: string;
    internalProductCode: string;
    timesUsed: number;
  }>;
  /**
   * Past invoices where Jonathan overrode the AI's category. Fed back into
   * the prompt as classification hints so the model learns from its
   * mistakes. Pulled from supplier_invoices WHERE category_was_manual=true.
   */
  manualCategoryExamples?: Array<{
    supplier: string;
    briefDescription: string;
    category: string;
  }>;
};

function buildPoPrompt(ctx: PoExtractorContext): string {
  const parts: string[] = [PO_PROMPT_BASE];

  if (ctx.catalog && ctx.catalog.length > 0) {
    const byCategory = new Map<string, Array<{ productCode: string; name: string; unit: string }>>();
    for (const row of ctx.catalog) {
      if (!byCategory.has(row.category)) byCategory.set(row.category, []);
      byCategory.get(row.category)!.push(row);
    }
    const blocks: string[] = [];
    for (const [cat, rows] of byCategory) {
      blocks.push(
        `### ${cat.toUpperCase()}\n` +
          rows.map((r) => `  ${r.productCode}  —  ${r.name}  (${r.unit})`).join("\n"),
      );
    }
    parts.push(
      "\n\nCATALOG — use these exact product_code values whenever the invoice line matches:\n" +
        blocks.join("\n\n"),
    );
  }

  if (ctx.supplierMappings && ctx.supplierMappings.length > 0) {
    const hints = ctx.supplierMappings
      .slice(0, 80) // cap context size — the most-used ones come first
      .map(
        (m) =>
          `  "${m.supplierName}" → "${m.supplierDescription}" = ${m.internalProductCode} (seen ${m.timesUsed}×)`,
      )
      .join("\n");
    parts.push(
      "\n\nLEARNED SUPPLIER MAPPINGS — when a line on this invoice matches one of these supplier descriptions, use the mapped code directly:\n" +
        hints,
    );
  }

  if (ctx.manualCategoryExamples && ctx.manualCategoryExamples.length > 0) {
    // These are classifications the user corrected after the AI got them
    // wrong. Treat them as authoritative — if the current invoice matches
    // one of these supplier/description patterns, use the corrected
    // category directly.
    const examples = ctx.manualCategoryExamples
      .slice(0, 30)
      .map((ex) => {
        const desc = ex.briefDescription ? ` / "${ex.briefDescription}"` : "";
        return `  Supplier "${ex.supplier}"${desc} → ${ex.category}`;
      })
      .join("\n");
    parts.push(
      "\n\nLEARNED CLASSIFICATIONS — these are invoices Jonathan re-categorized after the AI got them wrong. When a new invoice matches (same supplier, similar description), use the same category:\n" +
        examples,
    );
  }

  return parts.join("");
}

export async function extractPoFromPdf(
  dataBase64: string,
  ctx: PoExtractorContext = {},
): Promise<ExtractedPo> {
  const openai = client();
  const prompt = buildPoPrompt(ctx);
  const completion = await openai.chat.completions.create({
    // Upgraded from gpt-4o-mini → gpt-4o on 2026-04-22. Cost per invoice
    // goes from ~$0.002 to ~$0.02, but user reported classification errors
    // on production repair parts (miscategorized as cleaning supplies).
    // gpt-4o reads messy PDFs + follows classification rules much better.
    model: "gpt-4o",
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
          { type: "text", text: prompt },
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
    // Upgraded from gpt-4o-mini → gpt-4o on 2026-04-22. Cost per invoice
    // goes from ~$0.002 to ~$0.02, but user reported classification errors
    // on production repair parts (miscategorized as cleaning supplies).
    // gpt-4o reads messy PDFs + follows classification rules much better.
    model: "gpt-4o",
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
