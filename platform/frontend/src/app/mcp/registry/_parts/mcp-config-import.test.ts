import { describe, expect, test } from "vitest";
import { parseMcpConfigJson } from "./mcp-config-import";

describe("parseMcpConfigJson", () => {
  test("imports a Claude Desktop local server config", () => {
    expect(
      parseMcpConfigJson(
        JSON.stringify({
          mcpServers: {
            github: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-github"],
              env: {
                GITHUB_TOKEN: "<token>",
                LOG_LEVEL: "info",
              },
            },
          },
        }),
      ),
    ).toEqual({
      name: "github",
      serverType: "local",
      command: "npx",
      arguments: "-y\n@modelcontextprotocol/server-github",
      environment: [
        {
          key: "GITHUB_TOKEN",
          type: "secret",
          value: undefined,
          promptOnInstallation: true,
          required: true,
        },
        {
          key: "LOG_LEVEL",
          type: "plain_text",
          value: "info",
          promptOnInstallation: false,
          required: true,
        },
      ],
    });
  });

  test("imports a remote server and prompts for sensitive headers", () => {
    expect(
      parseMcpConfigJson(
        JSON.stringify({
          servers: {
            github: {
              type: "http",
              url: "https://api.githubcopilot.com/mcp/",
              headers: {
                Authorization: "Bearer $" + "{input:github_mcp_pat}",
                "X-Client": "archestra",
              },
            },
          },
        }),
      ),
    ).toMatchObject({
      name: "github",
      serverType: "remote",
      serverUrl: "https://api.githubcopilot.com/mcp/",
      additionalHeaders: [
        {
          headerName: "Authorization",
          promptOnInstallation: true,
          sensitive: true,
          value: undefined,
        },
        {
          headerName: "X-Client",
          promptOnInstallation: false,
          sensitive: false,
          value: "archestra",
        },
      ],
    });
  });

  test("rejects malformed and unsupported configurations", () => {
    expect(() => parseMcpConfigJson("{")).toThrow("Invalid JSON");
    expect(() => parseMcpConfigJson('{"args":["x"]}')).toThrow(
      "remote URL or a local command",
    );
    expect(() => parseMcpConfigJson('{"command":"node","args":[1]}')).toThrow(
      "arguments must all be strings",
    );
  });
});
