/**
 * One Hermes path for the in-process brain, the CLI adapter, and the evolution room.
 * The surface name is recorded. The decision is the same function.
 */
import { explainCase } from "./part2/explain";
import { isMicroCommand } from "./part5/voice";
import { reviewPatient } from "./part5/review";

export type HermesSurface = "in-process" | "cli" | "evolution";

export interface HermesPathResult {
  surface: HermesSurface;
  route: "micro" | "review" | "clinical" | "evolution";
  text: string;
  diagnosis: null;
  ordersPlaced: false;
}

export function runHermesPath(text: string, surface: HermesSurface, role = "doctor"): HermesPathResult {
  const said = (text ?? "").trim();
  if (surface === "evolution" || /\/evolve\b|evolution room/i.test(said)) {
    return {
      surface,
      route: "evolution",
      text: "Skill changes stay in the evolution room until a reviewer accepts them. The working version is not overwritten.",
      diagnosis: null,
      ordersPlaced: false,
    };
  }
  if (isMicroCommand(said)) {
    return { surface, route: "micro", text: "Micro Astra handles that command. Hermes was not required.", diagnosis: null, ordersPlaced: false };
  }
  if (/\breview (this |the )?patient\b/i.test(said)) {
    const review = reviewPatient(said, { presentation: said });
    const textOut = review.kind === "clinical-review"
      ? "Decision-support view is ready. No diagnosis was made and no order was placed."
      : review.view;
    return { surface, route: "review", text: textOut, diagnosis: null, ordersPlaced: false };
  }
  const explained = explainCase({ text: said, facts: { presentation: said } });
  const headline = explained.sections[0]?.body.join(" ") || "The case is not diagnosed.";
  return {
    surface,
    route: "clinical",
    text: `${headline} Hermes coordinated one path. No order was placed.`,
    diagnosis: null,
    ordersPlaced: false,
  };
}
