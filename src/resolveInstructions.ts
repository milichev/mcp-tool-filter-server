import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves the bundled instructions string.
 * Returns the esbuild-injected constant in production, or reads the file in dev mode.
 */
export function bundledInstructions(): string | undefined {
  try {
    return __BUNDLED_INSTRUCTIONS__;
  } catch {
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      return readFileSync(join(__dirname, "../instructions.md"), "utf8");
    } catch {
      return undefined;
    }
  }
}

export async function resolveInstructions(
  configured: string | false,
  upstreamInstructions: string | undefined,
): Promise<string | undefined> {
  if (configured === false) return undefined;

  const placeholder = "{{upstream}}";
  const placeholderIdx = configured.indexOf(placeholder);

  const result =
    placeholderIdx >= 0
      ? `${configured.substring(0, placeholderIdx)}${upstreamInstructions ?? ""}${configured.slice(placeholderIdx + placeholder.length)}`
      : `${configured}\n\n${upstreamInstructions ?? ""}`;
  return result.trim();

  // undefined → bundled default
  return bundledInstructions();
}

function withFallbackWarning(
  configured: string,
  reason: string,
): string | undefined {
  const warning =
    `> ⚠️ **MCP Instructions could not be loaded** from the configured source:\n` +
    `> \`${configured}\`\n` +
    `> Reason: ${reason}\n` +
    `> Falling back to default instructions. Verify Anytype is running and the link is valid.\n\n`;
  const fallback = bundledInstructions();
  return fallback ? `${warning}${fallback}` : warning;
}
