import type { EmbeddingConfig } from "@portkey-ai/mcp-tool-filter";
import { z } from "zod";
import { type LevelWithSilent } from "pino";
import {
  loadEnvFile,
  stringToArray,
  EnvSchema,
  unquote,
  substHomeDir,
  resolveFileRef,
  isFileRef,
} from "./config-utils.js";
import { readFileSync } from "node:fs";
import { bundledInstructions } from "./resolveInstructions.js";

loadEnvFile();

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
type FilterConfig = z.infer<typeof FilterConfigSchema>;

const UpstreamSchema = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("stdio"),
    command: z.string().default("npx"),
    args: stringToArray.default([]).transform((args) => args.map(substHomeDir)),
    env: EnvSchema.default({}),
    cwd: z.string().default(process.cwd()).optional(),
  }),

  z.object({
    transport: z.literal("http"),
    /** Base URL of the upstream MCP server (HTTP transport) */
    url: z.url(),
  }),
]);
type Upstream = z.infer<typeof UpstreamSchema>;
const DEFAULT_UPSTREAM = {
  transport: "stdio",
  command: "npx",
  args: [],
  env: {},
} satisfies Upstream;

const ProxySchema = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("http"),
    port: z.coerce.number().int().positive().optional().default(3000),
  }),
  z.object({
    transport: z.literal("stdio"),
  }),
]);

const InstructionsSchema = z
  .string()
  .optional()
  .transform((v): string | false => {
    if (v === "false") return false;
    v = unquote(v ?? "");
    return (
      (isFileRef(v)
        ? readFileSync(resolveFileRef(v), { encoding: "utf8" })
        : bundledInstructions()) ?? false
    );
  });

const LogLevelSchema = z.enum([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "silent",
] satisfies LevelWithSilent[]);

const ConfigSchema = z.object({
  upstream: UpstreamSchema.default(DEFAULT_UPSTREAM).optional(),
  proxy: ProxySchema.default({ transport: "stdio" }),
  filter: FilterConfigSchema.default({}),
  embedding: EmbeddingConfigSchema,
  instructions: InstructionsSchema,
  logLevel: LogLevelSchema.optional().default("info"),
  isDev: z.boolean().default(false),
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

const getPrefixedRaw = (prefix: string, env: typeof process.env) =>
  Object.fromEntries(
    Object.entries(env)
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => [k.slice(prefix.length).toLowerCase(), v]),
  );

let config: Config | undefined;

export function getConfig(): Config {
  if (!config) {
    const env = process.env;
    const provider = env.EMBEDDING_PROVIDER ?? "local";

    const embeddingRaw =
      provider === "local"
        ? {
            provider: "local" as const,
            model: env.EMBEDDING_MODEL,
            quantized: parseBool(env.EMBEDDING_QUANTIZED),
          }
        : {
            provider,
            apiKey: env.EMBEDDING_API_KEY,
            model: env.EMBEDDING_MODEL,
            dimensions: parseNum(env.EMBEDDING_DIMENSIONS),
            baseURL: env.EMBEDDING_BASE_URL,
          };

    const upstreamRaw = getPrefixedRaw("UPSTREAM_MCP_", env);
    const proxyRaw = getPrefixedRaw("PROXY_MCP_", env);

    config = ConfigSchema.parse({
      upstream: upstreamRaw,
      proxy: proxyRaw,
      filter: {
        topK: parseNum(env.FILTER_TOP_K),
        minScore: parseNum(env.FILTER_MIN_SCORE),
        contextMessages: parseNum(env.FILTER_CONTEXT_MESSAGES),
        alwaysInclude: parseList(env.FILTER_ALWAYS_INCLUDE),
        exclude: parseList(env.FILTER_EXCLUDE),
        maxContextTokens: parseNum(env.FILTER_MAX_CONTEXT_TOKENS),
        includeServerDescription: parseBool(
          env.FILTER_INCLUDE_SERVER_DESCRIPTION,
        ),
        debug: parseBool(env.FILTER_DEBUG),
      },
      embedding: embeddingRaw,
      logLevel: env.LOG_LEVEL,
      isDev: env.NODE_ENV === "development",
    });
  }

  return config;
}
