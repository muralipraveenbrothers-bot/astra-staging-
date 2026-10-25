import "vitest";

declare module "vitest" {
  interface Assertion<T = unknown> {
    toBeInTheDocument(): T;
    toHaveValue(value: unknown): T;
    toHaveClass(className: string): T;
  }
}
