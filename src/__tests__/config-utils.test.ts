import { describe, it, expect } from "vitest";
import { parseEnvString } from "../config-utils";

describe("config-utils", () => {
  describe("parseEnvString", () => {
    it("should parse the complex char-separated string with quotes", () => {
      expect(
        parseEnvString(
          'ANYTYPE_API_BASE_URL:"http://host.docker.internal:31009",DISCOVERY_TOOL_CONFIG:"{file:/app/config/discovery.json}",MCP_INSTRUCTIONS:"anytype://object?objectId=bafyreib&spaceId=bafyre.31e0h",OPENAPI_MCP_HEADERS:"{file:/app/config/openapi-headers.json}"',
        ),
      ).toEqual({
        ANYTYPE_API_BASE_URL: "http://host.docker.internal:31009",
        DISCOVERY_TOOL_CONFIG: "{file:/app/config/discovery.json}",
        MCP_INSTRUCTIONS:
          "anytype://object?objectId=bafyreib&spaceId=bafyre.31e0h",
        OPENAPI_MCP_HEADERS: "{file:/app/config/openapi-headers.json}",
      });
    });
  });
});
