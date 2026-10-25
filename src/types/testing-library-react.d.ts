declare module "@testing-library/react" {
  export function render(ui: unknown): {
    getByText(text: string | RegExp): unknown;
    queryByText(text: string | RegExp): unknown;
    getByRole(role: string, options?: Record<string, unknown>): unknown;
  };
  export const screen: {
    getByText(text: string | RegExp): unknown;
    queryByText(text: string | RegExp): unknown;
    getByRole(role: string, options?: Record<string, unknown>): unknown;
  };
  export const fireEvent: {
    (target: unknown, event?: unknown): void;
    click(target: unknown, event?: unknown): void;
    change(target: unknown, event?: unknown): void;
  };
  export function waitFor<T>(callback: () => T | Promise<T>): Promise<T>;
}
