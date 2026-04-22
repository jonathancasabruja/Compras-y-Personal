/**
 * AI-powered PDF extraction for purchase orders and cost invoices.
 *
 * DUAL-MODEL: prefers Claude Sonnet if ANTHROPIC_API_KEY is set (better
 * at reading scanned / photographed invoices because Claude sees the PDF
 * natively as images and follows nuanced classification rules better
 * than GPT on our test cases). Falls back to GPT-4o when the Anthropic
 * key is missing so nothing breaks during the rollout window.
 *
 * - Claude: uses the `document` content type with tool-use for structured
 *   output (tool_choice forces the response through the schema).
 * - OpenAI: chat-completions with `file` content type + `response_format:
 *   json_schema` strict mode.
 *
 * Set ONE of these env vars to activate:
 *   ANTHROPIC_API_KEY  (preferred; get from console.anthropic.com)
 *   OPENAI_API_KEY     (fallback; already set on Railway)
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

/** Which backend is active for this process. */
export type ExtractorBackend = "claude-sonnet" | "gpt-4o" | "none";

export function getExtractorBackend(): ExtractorBackend {
  if (process.env.ANTHROPIC_API_KEY) return "claude-sonnet";
  if (process.env.OPENAI_API_KEY) return "gpt-4o";
  return "none";
}

export function isExtractorConfigured(): boolean {
  return getExtractorBackend() !== "none";
}

function openaiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY no configurada — la extracción automática de PDF está deshabilitada. " +
        "Configura la variable en Railway (puedes copiarla de facturacion-cb).",
    );
  }
  return new OpenAI({ apiKey });
}

function anthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey });
}

function toDataUrl(b64: string): string {
  const clean = b64.replace(/^data:application\/pdf;base64,/, "");
  return `data:application/pdf;base64,${clean}`;
}

function cleanBase64(b64: string): string {
  return b64.replace(/^data:application\/pdf;base64,/, "");
}

/**
 * Claude's tool-use requires a JSON Schema input_schema. OpenAI's strict
 * json_schema is compatible — except Claude doesn't support `[type1, null]`
 * union types inline; it wants `anyOf`. Convert the OpenAI-flavoured
 * schema to Claude-compatible shape recursively.
 */
function toClaudeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toClaudeSchema);
  if (schema && typeof schema === "object") {
    const obj = schema as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "type" && Array.isArray(v)) {
        // ["string", "null"] → anyOf: [{type:"string"}, {type:"null"}]
        out.anyOf = (v as string[]).map((t) => ({ type: t }));
      } else {
        out[k] = toClaudeSchema(v);
      }
    }
    return out;
  }
  return schema;
}

/**
 * Run a PDF extraction through whichever backend is active. Returns the
 * parsed object already matching the schema shape.
 */
async function runExtraction<T>(
  pdfBase64: string,
  prompt: string,
  schema: Record<string, unknown>,
  toolName: string,
): Promise<T> {
  const backend = getExtractorBackend();
  if (backend === "none") {
    throw new Error(
      "Ni ANTHROPIC_API_KEY ni OPENAI_API_KEY están configuradas — la extracción de PDF está deshabilitada.",
    );
  }

  if (backend === "claude-sonnet") {
    const anthropic = anthropicClient();
    const response = await anthropic.messages.create({
      // Claude Sonnet 4.5 — state-of-the-art for document understanding
      // and classification. Reads PDFs natively as images.
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      tools: [
        {
          name: toolName,
          description:
            "Extract structured data from the invoice PDF. Always call this tool with complete, validated data.",
          input_schema: toClaudeSchema(schema) as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: toolName },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: cleanBase64(pdfBase64),
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    const toolUse = response.content.find((c: any) => c.type === "tool_use") as any;
    if (!toolUse) {
      throw new Error("Claude no devolvió la invocación al tool");
    }
    return toolUse.input as T;
  }

  // GPT-4o fallback
  const openai = openaiClient();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "file",
            file: {
              filename: "invoice.pdf",
              file_data: toDataUrl(pdfBase64),
            },
          } as unknown as OpenAI.Chat.ChatCompletionContentPart,
          { type: "text", text: prompt },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: toolName, strict: true, schema },
    },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("El modelo no devolvió contenido");
  return JSON.parse(content) as T;
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
  const prompt = buildPoPrompt(ctx);
  const parsed = await runExtraction<ExtractedPo>(
    dataBase64,
    prompt,
    PO_SCHEMA as unknown as Record<string, unknown>,
    "po_extraction",
  );

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
  return runExtraction<ExtractedCostInvoice>(
    dataBase64,
    COST_PROMPT,
    COST_SCHEMA as unknown as Record<string, unknown>,
    "cost_invoice_extraction",
  );
}

// ─── Correction chat ────────────────────────────────────────────────────────
// When the operator spots a mistake in an already-extracted invoice, they
// open a chat inside the invoice modal and tell the AI what's wrong. We
// re-send the PDF + current extracted state + chat history + new message,
// Claude responds with an explanation AND (optionally) a structured patch
// to apply to the stored row.

export type ChatMessage = { role: "user" | "assistant"; text: string; at: string };

/** Fields the correction tool is allowed to modify. Deliberately narrow —
 *  we don't let the AI change uploadedBy, fileUrl, etc. */
const CORRECTION_PATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    supplier: { type: "string", description: "Canonical supplier name" },
    invoiceNumber: { type: "string" },
    invoiceDate: { type: "string", description: "YYYY-MM-DD" },
    currency: { type: "string" },
    totalAmount: { type: "number" },
    category: {
      type: "string",
      enum: INVOICE_CATEGORIES as unknown as string[],
    },
    briefDescription: { type: "string", description: "Short summary (max 160 chars)" },
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
        },
        required: ["productCode", "productDescription", "qty", "unit", "unitPrice", "totalPrice"],
      },
    },
  },
} as const;

export type CorrectionPatch = Partial<{
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: string;
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
  }>;
}>;

export async function correctInvoiceWithChat(opts: {
  pdfBase64: string;
  currentData: {
    supplier: string | null;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    totalAmount: number | null;
    currency: string | null;
    category: string | null;
    briefDescription: string | null;
    extractedData: unknown;
  };
  chatHistory: ChatMessage[];
  userMessage: string;
}): Promise<{ assistantText: string; patch: CorrectionPatch | null }> {
  const backend = getExtractorBackend();
  if (backend !== "claude-sonnet") {
    // The chat UX is Claude-only — GPT-4o's strict JSON mode doesn't do
    // the "text answer + optional tool call" shape as cleanly.
    throw new Error(
      "La corrección por chat requiere ANTHROPIC_API_KEY. Configúrala en Railway.",
    );
  }

  const anthropic = anthropicClient();
  const systemPrompt = `You are a correction assistant for Casa Bruja's purchase invoice library. The operator noticed a mistake in the AI-extracted data for this invoice and is telling you what to fix.

You will be given:
1. The original PDF (re-read it fresh — don't trust what was extracted)
2. The CURRENT extracted data (possibly wrong)
3. Conversation history
4. The operator's latest message

Rules:
- Re-read the PDF carefully. Never fabricate product codes, prices, or quantities. If a field isn't visible in the PDF, say so.
- Reply conversationally in Spanish (the operator speaks Spanish, but product names stay in English if that's how they appear on the invoice).
- If the operator asks for a fix, call the apply_corrections tool with ONLY the fields that change. Leave everything else out of the tool call.
- If the operator just asks a clarifying question, reply with text only — don't call the tool.
- After calling the tool, briefly describe in your text response what you changed and why.

CURRENT EXTRACTED DATA (may be wrong):
${JSON.stringify(
  {
    supplier: opts.currentData.supplier,
    invoiceNumber: opts.currentData.invoiceNumber,
    invoiceDate: opts.currentData.invoiceDate,
    totalAmount: opts.currentData.totalAmount,
    currency: opts.currentData.currency,
    category: opts.currentData.category,
    briefDescription: opts.currentData.briefDescription,
    items: (opts.currentData.extractedData as any)?.items ?? [],
  },
  null,
  2,
)}`;

  // Build messages: PDF on the first user turn, then alternate chat history,
  // then the new user message.
  const messages: Anthropic.MessageParam[] = [];

  // First turn: PDF attachment + whatever the first user message was (or a
  // seed if this is their very first message).
  const firstHistoryUser = opts.chatHistory.find((m) => m.role === "user");
  const pdfIntroText = firstHistoryUser
    ? firstHistoryUser.text
    : "Aquí está el PDF de la factura. Voy a indicarte correcciones.";

  messages.push({
    role: "user",
    content: [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: cleanBase64(opts.pdfBase64),
        },
      },
      { type: "text", text: pdfIntroText },
    ],
  });

  // Replay the rest of the chat history (skip the first user message since
  // we folded it into the PDF turn above).
  let seenFirstUser = false;
  for (const m of opts.chatHistory) {
    if (m.role === "user" && !seenFirstUser) {
      seenFirstUser = true;
      continue;
    }
    messages.push({ role: m.role, content: m.text });
  }

  // Finally, the new user message.
  messages.push({ role: "user", content: opts.userMessage });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: systemPrompt,
    tools: [
      {
        name: "apply_corrections",
        description:
          "Update specific fields on the invoice based on the operator's correction. Only include fields that should change.",
        input_schema: toClaudeSchema(CORRECTION_PATCH_SCHEMA) as Anthropic.Tool.InputSchema,
      },
    ],
    messages,
  });

  // Extract the text reply and (optionally) the tool-use patch.
  let assistantText = "";
  let patch: CorrectionPatch | null = null;
  for (const block of response.content as any[]) {
    if (block.type === "text") assistantText += block.text;
    else if (block.type === "tool_use" && block.name === "apply_corrections") {
      patch = block.input as CorrectionPatch;
    }
  }
  if (!assistantText) {
    assistantText = patch
      ? "Listo — apliqué las correcciones."
      : "(respuesta vacía)";
  }
  return { assistantText, patch };
}
