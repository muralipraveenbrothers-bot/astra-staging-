import type { Page } from "playwright-core";

export interface ObservedElement {
  index: number;
  role: string;
  name: string;
  id?: string;
  text: string;
  bbox?: { x: number; y: number; width: number; height: number };
  tag: string;
  type?: string;
}

export interface BrowserObservation {
  url: string;
  title: string;
  heading?: string;
  elements: ObservedElement[];
}

const SENSITIVE_VALUE = /(?:\b\d{10,}\b|\b\d{4}\s?\d{4}\s?\d{4}\b|\b(?:UHID|MRN)\s*[-:#]?\s*\d+\b)/i;

function clip(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 60);
}

export async function observePage(page: Page): Promise<BrowserObservation> {
  const raw = await page.evaluate(() => {
    const roleOf = (el: Element): string => {
      const explicit = el.getAttribute("role");
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      if (tag === "a") return "link";
      if (tag === "button") return "button";
      if (tag === "select") return "combobox";
      if (tag === "textarea") return "textbox";
      if (tag === "input") {
        const type = (el as HTMLInputElement).type;
        if (type === "checkbox") return "checkbox";
        if (type === "radio") return "radio";
        return "textbox";
      }
      return tag;
    };
    const nameOf = (el: Element): string => {
      const aria = el.getAttribute("aria-label") || el.getAttribute("title");
      if (aria) return aria;
      const id = el.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label?.textContent) return label.textContent;
      }
      return (el.textContent || (el as HTMLInputElement).value || "").trim();
    };
    const selector = [
      "a[href]",
      "button",
      "input",
      "select",
      "textarea",
      "[role=button]",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const elements = Array.from(document.querySelectorAll(selector)).filter((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    }).slice(0, 80).map((el) => {
      const rect = el.getBoundingClientRect();
      const input = el as HTMLInputElement;
      return {
        role: roleOf(el),
        name: nameOf(el),
        id: el.getAttribute("id") || undefined,
        text: el.textContent || input.value || "",
        tag: el.tagName.toLowerCase(),
        type: input.type || undefined,
        value: input.value || "",
        bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    });
    const heading = document.querySelector("h1,h2,h3,[role=heading]")?.textContent || "";
    return { title: document.title, heading, elements };
  });

  const elements = raw.elements.slice(0, 60).map((el, index) => {
    const sensitive = el.type === "password" || SENSITIVE_VALUE.test(el.value || el.text || el.name);
    return {
      index,
      role: clip(el.role),
      name: clip(sensitive ? "[masked]" : el.name),
      id: el.id ? clip(el.id) : undefined,
      text: clip(sensitive ? "[masked]" : el.text),
      bbox: el.bbox,
      tag: clip(el.tag),
      type: el.type ? clip(el.type) : undefined,
    };
  });

  return {
    url: page.url(),
    title: clip(raw.title),
    heading: raw.heading ? clip(raw.heading) : undefined,
    elements,
  };
}
