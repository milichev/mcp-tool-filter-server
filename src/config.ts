import { existsSync } from "node:fs";
import { join } from "node:path";
import type { EmbeddingConfig } from "@portkey-ai/mcp-tool-filter";
import { z } from "zod";

const dotenvFile = join(process.cwd(), ".env");
if (existsSync(dotenvFile)) {
  process.loadEnvFile(dotenvFile);
}

const stringToArray = z.preprocess((val) => {
  if (!val || typeof val !== "string") return undefined;
  return val.split(/,/).map((s) => s.replace(/\\,/g, ","));
}, z.array(z.string()).default([]));

const stringToRecord = z.preprocess((val) => {
  if (!val || typeof val !== "string") return undefined;
  return Object.fromEntries(
    val.split(",").map((i) => {
      const [k, ...v] = i.split(":");
      return [k, v.join(":")].map((s) => s.trim());
    }),
  );
}, z.record(z.string(), z.string()).default({}));

const EmbeddingConfigSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.enum(["openai", "voyage", "cohere"]),
    apiKey: z.string().min(1),
    model: z.string().optional(),
    dimensions: z.number().int().positive().optional(),
    baseURL: z.string().url().optional(),
  }),
  z.object({
    provider: z.literal("local"),
    model: z.string().optional(),
    quantized: z.boolean().optional(),
  }),
]);

// Compile-time guard: schema output must be assignable to library's EmbeddingConfig
type _AssertEmbeddingConfig =
  z.infer<typeof EmbeddingConfigSchema> extends EmbeddingConfig ? true : never;

const FilterConfigSchema = z.object({
  topK: z.number().int().positive().default(20).optional(),
  minScore: z.number().min(0).max(1).default(0.3).optional(),
  contextMessages: z.number().int().positive().default(3).optional(),
  alwaysInclude: z.array(z.string()).default([]).optional(),
  exclude: z.array(z.string()).default([]).optional(),
  maxContextTokens: z.number().int().positive().default(500).optional(),
  includeServerDescription: z.boolean().default(false).optional(),
  debug: z.boolean().default(false).optional(),
});

const UpstreamSchema = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("stdio"),
    command: z.string().default("npx"),
    args: stringToArray.default([]),
    env: stringToRecord.default({}),
    cwd: z.string().optional(),
  }),

  z.object({
    transport: z.literal("http"),
    /** Base URL of the upstream MCP server (HTTP transport) */
    url: z.url(),
  }),
]);

const ProxySchema = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("http"),
    port: z.coerce.number().int().positive().default(3000).optional(),
  }),
  z.object({
    transport: z.literal("stdio"),
  }),
]);

const ConfigSchema = z.object({
  upstream: UpstreamSchema.default({
    transport: "stdio",
    command: "npx",
    args: [],
    env: {},
  }).optional(),
  proxy: ProxySchema.default({ transport: "stdio" }),
  filter: FilterConfigSchema.default({}),
  embedding: EmbeddingConfigSchema,
  logLevel: z
    .enum(["trace", "debug", "info", "warn", "error", "silent"])
    .optional()
    .default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

const parseList = (raw: string | undefined): string[] | undefined =>
  raw
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const parseNum = (raw: string | undefined): number | undefined =>
  raw !== undefined ? Number(raw) : undefined;

const parseBool = (raw: string | undefined): boolean | undefined =>
  raw !== undefined ? raw === "true" : undefined;

const getPrefixedRaw = (prefix: string) =>
  Object.fromEntries(
    Object.entries(process.env)
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => [k.slice(prefix.length).toLowerCase(), v]),
  );

let config: Config | undefined;

export function getConfig(): Config {
  if (!config) {
    const provider = process.env.EMBEDDING_PROVIDER ?? "local";

    const embeddingRaw =
      provider === "local"
        ? {
            provider: "local" as const,
            model: process.env.EMBEDDING_MODEL,
            quantized: parseBool(process.env.EMBEDDING_QUANTIZED),
          }
        : {
            provider,
            apiKey: process.env.EMBEDDING_API_KEY,
            model: process.env.EMBEDDING_MODEL,
            dimensions: parseNum(process.env.EMBEDDING_DIMENSIONS),
            baseURL: process.env.EMBEDDING_BASE_URL,
          };

    const upstreamRaw = getPrefixedRaw("UPSTREAM_MCP_");
    const proxyRaw = getPrefixedRaw("PROXY_MCP_");

    config = ConfigSchema.parse({
      upstream: upstreamRaw,
      proxy: proxyRaw,
      filter: {
        topK: parseNum(process.env.FILTER_TOP_K),
        minScore: parseNum(process.env.FILTER_MIN_SCORE),
        contextMessages: parseNum(process.env.FILTER_CONTEXT_MESSAGES),
        alwaysInclude: parseList(process.env.FILTER_ALWAYS_INCLUDE),
        exclude: parseList(process.env.FILTER_EXCLUDE),
        maxContextTokens: parseNum(process.env.FILTER_MAX_CONTEXT_TOKENS),
        includeServerDescription: parseBool(
          process.env.FILTER_INCLUDE_SERVER_DESCRIPTION,
        ),
        debug: parseBool(process.env.FILTER_DEBUG),
      },
      embedding: embeddingRaw,
      logLevel: process.env.LOG_LEVEL,
    });
  }

  return config;
}
