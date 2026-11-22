import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Inlines the JavaScript bundle into `index.html`, so the build output is one
 * self-contained file that also works when opened straight from disk.
 */
function singleFile(): Plugin {
  return {
    name: "single-file",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((file) => file.type === "asset" && file.fileName.endsWith(".html"));
      if (!html || html.type !== "asset") return;
      // Drop the whitespace between tags first, so no stray text nodes end up in the page.
      let source = String(html.source).replace(/>\s+</g, "><").trim();
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type !== "chunk") continue;
        const tag = new RegExp(`<script\\b[^>]*\\bsrc="[^"]*${file.fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*></script>`);
        if (!tag.test(source)) continue;
        const code = file.code.replace(/<\/script/g, "<\\/script");
        source = source.replace(tag, () => `<script type="module">${code}</script>`);
        delete bundle[name];
      }
      html.source = source;
    },
  };
}

export default defineConfig({
  root: "src",
  base: "./",
  plugins: [singleFile()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
    modulePreload: false,
    cssCodeSplit: false,
  },
  test: {
    root: ".",
    include: ["tests/**/*.test.ts"],
  },
});
