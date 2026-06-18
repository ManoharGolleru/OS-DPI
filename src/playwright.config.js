import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./authoring/e2e",
  use: {
    baseURL: "http://127.0.0.1:8080/OS-DPI/",
  },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:8080/OS-DPI/",
    reuseExistingServer: true,
  },
});
