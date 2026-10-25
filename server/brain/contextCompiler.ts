/**
 * The context compiler shows Hermes the case slice and the tool cards for
 * this turn. It does not hand every tool to every agent.
 */
import type { PrivacyClass } from "./privacy";
import { BRAIN_TOOLS, toolsForRole, type BrainToolCard, type ToolClass } from "./toolRegistry";
import type { AstraCaseState } from "./caseState";

export interface CompiledContext {
  caseId: string | null;
  stage: string | null;
  presentation: string;
  missingInformation: string[];
  privacy: PrivacyClass;
  tools: BrainToolCard[];
  omittedToolCount: number;
}

export function compileContext(input: {
  text: string;
  role: string;
  privacy: PrivacyClass;
  classes: readonly ToolClass[];
  caseState?: AstraCaseState | null;
}): CompiledContext {
  const tools = toolsForRole(input.role, input.classes);
  const omittedToolCount = BRAIN_TOOLS.length - tools.length;
  const presentation = input.caseState?.presentation || input.text;
  return {
    caseId: input.caseState?.caseId ?? null,
    stage: input.caseState?.stage ?? null,
    presentation,
    missingInformation: input.caseState?.missingInformation ?? [],
    privacy: input.privacy,
    tools,
    omittedToolCount,
  };
}
