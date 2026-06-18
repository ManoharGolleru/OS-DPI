import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      components: path.resolve("./components"),
      app: path.resolve("."),
      css: path.resolve("./css"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["authoring/**/*.test.js"],
    setupFiles: ["./authoring/testSetup.js"],
  },
});
