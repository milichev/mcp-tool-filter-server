import * as esbuild from "esbuild";
import { readFileSync } from "fs";
import { chmod } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// see https://github.com/evanw/esbuild/pull/2067
const jsBanner = `#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
`;

async function build() {
  const instructions = readFileSync(
    join(__dirname, "../instructions.md"),
    "utf8",
  );

  await esbuild.build({
    entryPoints: [join(__dirname, "..", "src", "index.ts")],
    bundle: true,
    minify: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile: "bin/cli.mjs",
    banner: { js: jsBanner },
    // @xenova/transformers statically imports both onnx packages.
    // onnxruntime-node contains native .node binaries that cannot be bundled.
    // onnxruntime-web must also stay external to avoid bundling its wasm assets.
    // sharp is an optional transitive dep with native binaries.
    // All three must be present in node_modules at runtime.
    external: ["onnxruntime-node", "onnxruntime-web", "sharp"],
    define: {
      __BUNDLED_INSTRUCTIONS__: JSON.stringify(instructions),
    },
  });

  await chmod("./bin/cli.mjs", 0o755);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
