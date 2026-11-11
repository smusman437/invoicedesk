import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Native better-sqlite3 bindings are unreliable in worker threads.
    pool: "forks",
    fileParallelism: false,
  },
});
