import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests run many real git and git-lfs processes.
    testTimeout: 30_000,
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
