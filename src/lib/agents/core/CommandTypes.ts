export type CommandIntent = string;

export interface CommandPayload {
  text: string;
  source: "text" | "voice" | "dashboard";
  imageData?: string;
  contextUhid?: string;
}

export interface CommandExecutionResult {
  intent: CommandIntent;
  authorized: boolean;
  message: string;
  delegatedAgent?: string;
  requiresHermes?: boolean;
  findings?: any;
}
