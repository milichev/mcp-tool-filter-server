import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    // Required for ESM/TS interop in some MCP SDK versions
    deps: {
      interopDefault: true,
    },
  },
});
