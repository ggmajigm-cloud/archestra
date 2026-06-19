import type { McpCatalogFormValues } from "./mcp-catalog-form.types";

type JsonObject = Record<string, unknown>;

export type ImportedMcpConfig = {
  name?: string;
  serverType: "local" | "remote";
  serverUrl?: string;
  command?: string;
  arguments?: string;
  environment?: NonNullable<
    NonNullable<McpCatalogFormValues["localConfig"]>["environment"]
  >;
  additionalHeaders?: NonNullable<McpCatalogFormValues["additionalHeaders"]>;
};

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function looksSensitive(name: string, value: string) {
  return (
    /(token|secret|password|api.?key|private.?key)/i.test(name) ||
    /\$\{input:[^}]+\}/.test(value) ||
    /^<[^>]+>$/.test(value) ||
    /^YOUR_[A-Z0-9_]+(?:_HERE)?$/.test(value)
  );
}

function unwrapServerConfig(root: JsonObject) {
  for (const containerName of ["servers", "mcpServers"]) {
    const container = root[containerName];
    if (!isObject(container)) continue;
    const first = Object.entries(container).find(([, value]) =>
      isObject(value),
    );
    if (first && isObject(first[1])) {
      return { name: first[0], config: first[1] };
    }
  }
  return { name: undefined, config: root };
}

export function parseMcpConfigJson(input: string): ImportedMcpConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("Invalid JSON configuration");
  }
  if (!isObject(parsed)) {
    throw new Error("MCP configuration must be a JSON object");
  }

  const { name, config } = unwrapServerConfig(parsed);
  const inputDefinitions = new Map(
    (Array.isArray(parsed.inputs) ? parsed.inputs : [])
      .filter(isObject)
      .filter((definition) => typeof definition.id === "string")
      .map((definition) => [
        definition.id as string,
        {
          description:
            typeof definition.description === "string"
              ? definition.description
              : "",
          sensitive: definition.password === true,
        },
      ]),
  );
  const url =
    typeof config.url === "string"
      ? config.url
      : typeof config.serverUrl === "string"
        ? config.serverUrl
        : undefined;

  if (url) {
    const headers = stringRecord(config.headers);
    return {
      name,
      serverType: "remote",
      serverUrl: url,
      additionalHeaders: Object.entries(headers).map(([headerName, value]) => {
        const sensitive = looksSensitive(headerName, value);
        const inputId = value.match(/\$\{input:([^}]+)\}/)?.[1];
        const definition = inputId ? inputDefinitions.get(inputId) : undefined;
        const includeBearerPrefix = /^Bearer\s+\$\{input:[^}]+\}$/.test(value);
        return {
          headerName,
          promptOnInstallation: sensitive || Boolean(definition),
          required: true,
          value: sensitive || definition ? undefined : value,
          description: definition?.description ?? "",
          includeBearerPrefix,
          sensitive: sensitive || definition?.sensitive === true,
        };
      }),
    };
  }

  const command =
    typeof config.command === "string" ? config.command : undefined;
  if (!command) {
    throw new Error(
      "Configuration must contain either a remote URL or a local command",
    );
  }

  const args = Array.isArray(config.args)
    ? config.args
    : Array.isArray(config.arguments)
      ? config.arguments
      : [];
  if (!args.every((arg) => typeof arg === "string")) {
    throw new Error("MCP server arguments must all be strings");
  }

  const env = stringRecord(config.env ?? config.environment);
  return {
    name,
    serverType: "local",
    command,
    arguments: args.join("\n"),
    environment: Object.entries(env).map(([key, value]) => {
      const sensitive = looksSensitive(key, value);
      return {
        key,
        type: sensitive ? ("secret" as const) : ("plain_text" as const),
        value: sensitive ? undefined : value,
        promptOnInstallation: sensitive,
        required: true,
      };
    }),
  };
}
