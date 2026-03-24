import { readFileSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const repoRoot = dirname(fileURLToPath(import.meta.url));

/**
 *  * `__dirname`: pino and xenova need it
 *
 *  * `require`: @see https://github.com/evanw/esbuild/pull/2067
 */
const jsBanner = `#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`;

async function build() {
  const entryPoint = join(repoRoot, "src", "index.ts");
  const outfile = join(repoRoot, "bin", "mcp-tool-filter-server.mjs");
  const instructionsFile = join(repoRoot, "instructions.md");

  const instructions = readFileSync(instructionsFile, "utf8");

  await esbuild.build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    minify: true,
    platform: "node",
    target: "node25",
    format: "esm",
    packages: "external",
    // @xenova/transformers statically imports both onnx packages.
    // onnxruntime-node contains native .node binaries that cannot be bundled.
    // onnxruntime-web must also stay external to avoid bundling its wasm assets.
    // sharp is an optional transitive dep with native binaries.
    // All three must be present in node_modules at runtime.
    external: ["onnxruntime-node", "onnxruntime-web", "sharp", "pino-pretty"],
    banner: { js: jsBanner },
    define: {
      __BUNDLED_INSTRUCTIONS__: JSON.stringify(instructions),
    },
  });

  await chmod(outfile, 0o755);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
