/**
 * ASTRA AI — Vitest configuration (architecture + round-trip tests).
 * Scoped to *.spec.ts so the pre-existing *.test.ts scripts (plain assert
 * files run ad-hoc via tsx) are not affected.
 */
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vitest 4 ships its own Vite and otherwise shares node_modules/.vite with
  // the dev server, so a test run deletes deps out from under :5173.
  cacheDir: "node_modules/.vitest-cache",
  resolve: {
    // Same alias as vite.config.ts + tsconfig.app.json, so first-party modules
    // (e.g. src/astra/voice/roundTrip) resolve with "@/..." inside specs too.
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    environment: "node",
    include: [
      "server/**/*.spec.ts",
      "src/agents/framework/**/*.spec.ts",
      // Voice/chat round-trip contract (Guardian, overlays, TTS fallback chain).
      "src/astra/voice/**/*.spec.ts",
      "src/astra/saarathi/**/*.spec.ts",
      "src/astra/clinical/**/*.spec.ts",
      "src/components/Communications/**/*.spec.ts",
      // Dr. Mayin 7D engine (conversation controller, memory gateway, workflow).
      "src/features/mayin/**/*.spec.ts",
      // Optional-component adapters (isolated Laya System-1 decisions).
      "src/astra/plugins/**/*.spec.ts",
      // Doctor Approval Gate & Decision Log
      "src/astra/approval/**/*.spec.ts",
      "src/lib/**/*.spec.ts",
      // Anatomy 3D accuracy checks (axis convention, laterality, labels).
      "src/features/anatomy3d/**/*.spec.ts",
      "src/astra/reflex/**/*.spec.ts",
      "src/astra/reflex/**/*.spec.tsx",
      "src/astra/controls/**/*.spec.ts",
      "src/astra/knowledge/**/*.spec.ts",
      "src/astra/knowledge/**/*.spec.tsx",
      "src/astra/agentops/**/*.spec.ts",
      "src/astra/agentops/**/*.spec.tsx",
    ],
    testTimeout: 20000,
    hookTimeout: 20000,
    reporters: ["default"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "server/reflex/browser/observe.spec.ts",
      "server/reflex/browser/browserLoop.spec.ts",
    ],
    server: {
      deps: {
        // First-party Astra modules (src/astra/** — Security Kernel, evidence,
        // admission) must be transformed as project code, never externalized
        // as a CJS package (the space in the project path breaks resolution).
        inline: [/src[/\\]astra[/\\]/],
      },
    },
  },
});
