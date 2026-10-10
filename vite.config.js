import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: false,
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        library: resolve("library/index.html"),
        reader: resolve("library/reader.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["library/src/**/*.test.{js,jsx}"],
    restoreMocks: true,
  },
});
