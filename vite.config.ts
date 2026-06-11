import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built site works from any subpath (GitHub Pages,
  // a shared static host, a "walk this project" link, etc.).
  base: "./",
  server: {
    host: true,
  },
});
