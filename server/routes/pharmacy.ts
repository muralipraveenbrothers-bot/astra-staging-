import type { Express, Request, Response } from "express";
import { authenticate } from "../rbac";
import { centralAiChat } from "../ai/centralCore";

const MAX_BILL_BYTES = 12 * 1024 * 1024;

export function registerPharmacyRoutes(app: Express): void {
  app.post("/api/pharmacy/bill-ocr", authenticate, async (req: Request, res: Response) => {
    const filename = typeof req.body?.filename === "string" ? req.body.filename : "bill-image";
    const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "application/octet-stream";
    const dataBase64 = typeof req.body?.dataBase64 === "string" ? req.body.dataBase64.replace(/^data:[^;]+;base64,/, "") : "";
    if (!dataBase64) {
      res.status(400).json({ error: "MISSING_IMAGE", message: "dataBase64 is required" });
      return;
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(dataBase64, "base64");
    } catch {
      res.status(400).json({ error: "INVALID_IMAGE", message: "The uploaded bill is not valid base64 data" });
      return;
    }
    if (!bytes.length || bytes.length > MAX_BILL_BYTES) {
      res.status(413).json({ error: "IMAGE_TOO_LARGE", message: "Bill images must be between 1 byte and 12 MB" });
      return;
    }
    if (!mimeType.startsWith("image/")) {
      res.status(415).json({ error: "IMAGE_REQUIRED", message: "Upload a bill photo or scanned image (JPG, PNG, WEBP)" });
      return;
    }

    try {
      const result = await centralAiChat({
        agent: "astra",
        clinical: false,
        temperature: 0,
        max_tokens: 1800,
        messages: [
          {
            role: "system",
            content: "Extract this pharmacy supplier bill. Return JSON only: {\"rawText\":\"...\",\"invoiceNumber\":\"...\",\"items\":[{\"brand\":\"...\",\"generic\":\"...\",\"batch\":\"...\",\"expiry\":\"YYYY-MM-DD\",\"sheets\":0,\"tabsPerSheet\":0,\"ratePerSheet\":0}]}. Preserve only readable values and use empty strings or zero for unclear fields; never invent.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `OCR this pharmacy bill image named ${filename}.` },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${dataBase64}` } },
            ],
          },
        ],
      });
      if (result.status >= 400 || !result.text.trim()) {
        res.status(502).json({ error: "OCR_UNAVAILABLE", message: "The configured AI vision gateway could not read this bill" });
        return;
      }
      const clean = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      let parsed: any = null;
      try { parsed = JSON.parse(clean); } catch { /* keep raw OCR */ }
      res.json({ ok: true, text: parsed?.rawText || result.text.trim(), invoiceNumber: parsed?.invoiceNumber || "", items: Array.isArray(parsed?.items) ? parsed.items : [], source: "astra-vision-ocr" });
    } catch (error) {
      res.status(502).json({ error: "OCR_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  });
}
