import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.js"],
    environment: "node",
    server: {
      deps: {
        inline: [/^(?!.*node_modules).*$/],
      },
    },
  },
});
