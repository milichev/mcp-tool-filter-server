import { existsSync } from "node:fs";
import { join, sep, normalize } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";

export function loadEnvFile(filename = join(process.cwd(), ".env")) {
  if (existsSync(filename)) {
    process.loadEnvFile(filename);
  }
}

export const stringToArray = z.preprocess((val) => {
  if (typeof val !== "string" || !val.trim()) return [];
  return parseCommaSeparatedArgs(val);
}, z.array(z.string()).default([]));

export const EnvSchema = z.string().transform(parseEnvString);

/**
 * Splits a string by commas, respecting single and double quotes.
 * Handles: -y,"~/.local/bin/folder 1/anytype.mjs"
 */
export function parseCommaSeparatedArgs(input: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if ((char === '"' || char === "'") && (i === 0 || input[i - 1] !== "\\")) {
      if (!inQuotes) {
        inQuotes = char;
      } else if (inQuotes === char) {
        inQuotes = null;
      } else {
        current += char;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current || input.endsWith(",")) {
    result.push(current.trim());
  }

  return result.filter((arg) => arg !== "");
}

/**
 * Parses MCP environment strings with support for quoted values.
 * Format: KEY1:VALUE1,KEY2:'QUOTED_VALUE'
 */
export function parseEnvString(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!input) return result;

  let i = 0;
  while (i < input.length) {
    // 1. Extract Key (up to the first colon)
    const colonIndex = input.indexOf(":", i);
    if (colonIndex === -1) break;
    const key = input.substring(i, colonIndex).trim();

    i = colonIndex + 1;
    let value = "";

    // 2. Extract Value (handle quotes or comma-delimiter)
    const char = input[i];
    if (char === "'" || char === '"') {
      const quote = char;
      i++; // Skip opening quote
      const endQuoteIndex = input.indexOf(quote, i);
      if (endQuoteIndex !== -1) {
        value = input.substring(i, endQuoteIndex);
        i = endQuoteIndex + 1;
      }
    } else {
      const nextComma = input.indexOf(",", i);
      if (nextComma === -1) {
        value = input.substring(i);
        i = input.length;
      } else {
        value = input.substring(i, nextComma);
        i = nextComma;
      }
    }

    if (key) result[key] = value;

    // 3. Skip the comma and whitespace for the next pair
    if (input[i] === ",") i++;
    while (i < input.length && /\s/.test(input[i])) i++;
  }

  return result;
}

/**
 * Removes surrounding quotes if they match.
 * Supports escaped quotes within the string.
 */
export function unquote(input: string): string {
  const trimmed = input.trim();
  // Group 1: Opening quote (' or ")
  // Group 2: Content (Allows escaped characters or anything EXCEPT the opening quote)
  // \1: Closing quote matching Group 1
  const re = /^(['"])((?:\\.|(?!\1).)*)\1$/;

  const match = trimmed.match(re);
  if (match) {
    // Return the content, unescaping any quotes that were escaped
    return match[2].replace(/\\(['"])/g, "$1");
  }

  return trimmed;
}

export const quotedStringSchema = z.string().transform(unquote);

export function substHomeDir(pathname: string) {
  return pathname.startsWith(`~${sep}`)
    ? `${homedir()}${pathname.slice(1)}`
    : pathname;
}

const fileRefRegex = /^\{file:(.+)\}$/;

export function isFileRef(input: string) {
  return fileRefRegex.test(input);
}

export function resolveFileRef(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(fileRefRegex);

  if (!match) return trimmed;

  const rawPath = match[1].trim();
  // 1. Expand Tilde
  const expanded = substHomeDir(rawPath);
  // 2. Fix Separators (Crucial for cross-platform)
  return normalize(expanded);
}
