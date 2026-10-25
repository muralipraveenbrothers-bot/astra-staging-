import type { Express, Request, Response } from "express";
import { authenticate } from "../rbac";
import { centralAiChat } from "../ai/centralCore";

export function registerWardVitalsRoutes(app: Express): void {
  app.post("/api/ward/vitals-ocr", authenticate, async (req: Request, res: Response) => {
    const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "";
    const dataBase64 = typeof req.body?.dataBase64 === "string" ? req.body.dataBase64.replace(/^data:[^;]+;base64,/, "") : "";
    if (!mimeType.startsWith("image/") || !dataBase64) {
      res.status(400).json({ error: "IMAGE_REQUIRED", message: "Upload a monitor photo." });
      return;
    }
    if (Buffer.byteLength(dataBase64, "base64") > 12 * 1024 * 1024) {
      res.status(413).json({ error: "IMAGE_TOO_LARGE", message: "Monitor photos must be 12 MB or smaller." });
      return;
    }
    try {
      const result = await centralAiChat({
        agent: "astra",
        clinical: true,
        temperature: 0,
        max_tokens: 900,
        messages: [
          { role: "system", content: "Read only visible patient-monitor vitals. Return strict JSON with keys hr,bpSystolic,bpDiastolic,temp,rr,spo2,confidence,unclear. Use null when unreadable. Never infer missing values." },
          { role: "user", content: [{ type: "text", text: "Extract the monitor readings from this ward photo." }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${dataBase64}` } }] },
        ],
      });
      if (result.status >= 400 || !result.text.trim()) throw new Error("vision gateway returned no reading");
      res.json({ ok: true, text: result.text.trim(), requiresDoctorReview: true });
    } catch (error) {
      res.status(502).json({ error: "VITALS_OCR_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  });
}
