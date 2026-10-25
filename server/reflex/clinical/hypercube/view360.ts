export interface View360 {
  finding: string;
  forward: string[];
  reverse: string[];
  lateral: string[];
  up: string[];
  down: string[];
  time: string[];
  contradiction: string[];
}

/** Assembles seven directions from modules that already ran. It does not generate new claims. */
export function view360(finding: string, parts: Omit<View360, "finding">): View360 {
  return { finding, ...parts };
}
