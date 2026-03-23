import * as esbuild from "esbuild";
import { readFileSync } from "fs";
import { chmod } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { nodeExternalsPlugin } from "esbuild-node-externals";
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
    banner: {
      js: jsBanner,
    },
    // external: ["util", "onnxruntime-node", "sharp"],
    plugins: [nodeExternalsPlugin()],
    define: {
      __BUNDLED_INSTRUCTIONS__: JSON.stringify(instructions),
    },
  });

  // Make the output file executable
  await chmod("./bin/cli.mjs", 0o755);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
