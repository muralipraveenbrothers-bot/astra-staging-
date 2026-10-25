import type { Express, Request, Response } from "express";
import { authenticate } from "../rbac";

type ExtractedField = { value: string; source: "document-text"; confidence: "high" | "medium" };
function pick(text: string, labels: string[]): string | undefined {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = text.match(new RegExp(`(?:${escaped})\\s*[:=-]\\s*([^\\n,;|]+)`, "i"));
  return match?.[1]?.trim() || undefined;
}
const field = (value: string | undefined): ExtractedField | undefined => value ? { value, source: "document-text", confidence: "medium" } : undefined;

export function registerReceptionDocumentRoutes(app: Express) {
  app.post("/api/reception/document-intake", authenticate, (req: Request, res: Response) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const filename = typeof req.body?.filename === "string" ? req.body.filename : "document";
    if (!text) return res.status(422).json({ ok: false, error: "DOCUMENT_TEXT_REQUIRED", message: "Provide extracted document text; image OCR is not silently simulated." });
    const extracted = Object.fromEntries(Object.entries({
      name: field(pick(text, ["name", "patient name", "full name"])), age: field(pick(text, ["age"])),
      sex: field(pick(text, ["sex", "gender"])), phone: field(pick(text, ["phone", "mobile", "contact"])),
      uhid: field(pick(text, ["uhid", "mrn", "mr number", "patient id"])),
    }).filter(([, value]) => value));
    res.json({ ok: true, filename, extracted, fieldCount: Object.keys(extracted).length, provenance: { method: "label-value-document-text", source: filename, inventedFields: false }, nextAction: "Review extracted fields before registration" });
  });
}
