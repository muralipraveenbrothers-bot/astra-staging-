import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "node_modules/.vitest-browser-cache",
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
  test: {
    environment: "node",
    include: [
      "server/reflex/browser/observe.spec.ts",
      "server/reflex/browser/browserLoop.spec.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    fileParallelism: false,
    maxConcurrency: 1,
    sequence: { concurrent: false },
    testTimeout: 60000,
    hookTimeout: 60000,
    server: { deps: { inline: [/src[/\\]astra[/\\]/] } },
  },
});
