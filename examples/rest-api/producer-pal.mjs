#!/usr/bin/env node

// Producer Pal REST API client (Node.js, no dependencies)
// Requires Node.js 18+ for built-in fetch
//
// Usage:
//   node producer-pal.mjs <tool-name> [json-args] [options]
//   node producer-pal.mjs --list-tools [options]
//
// Options:
//   --url URL              REST API base URL (default: http://localhost:3350)
//   --format json|compact  Response format (default: json)
//   --timeout-ms N         Per-call timeout in milliseconds
//   --help, -h             Show help
//
// Examples:
//   node producer-pal.mjs --list-tools
//   node producer-pal.mjs ppal-read-live-set
//   node producer-pal.mjs ppal-read-track '{"trackIndex": 0}'
//   node producer-pal.mjs --list-tools | jq -r '.tools[].name'
//   node producer-pal.mjs ppal-read-live-set | jq .result.tempo

function usage() {
  return [
    "Usage:",
    "  node producer-pal.mjs <tool-name> [json-args] [options]",
    "  node producer-pal.mjs --list-tools [options]",
    "",
    "Options:",
    "  --url URL              REST API base URL (default: http://localhost:3350)",
    "  --format json|compact  Response format (default: json)",
    "  --timeout-ms N         Per-call timeout in milliseconds",
    "  --help, -h             Show help",
    "",
    "Examples:",
    "  node producer-pal.mjs --list-tools",
    "  node producer-pal.mjs ppal-read-live-set",
    "  node producer-pal.mjs ppal-read-track '{\"trackIndex\": 0}'",
  ].join("\n");
}

function parseArgs(argv) {
  const opts = {
    url: "http://localhost:3350",
    format: "json",
    timeoutMs: undefined,
    listTools: false,
    toolName: undefined,
    toolArgs: {},
  };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const takeValue = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      return v;
    };

    if (arg === "--url") opts.url = takeValue();
    else if (arg === "--format") opts.format = takeValue();
    else if (arg === "--timeout-ms") opts.timeoutMs = Number(takeValue());
    else if (arg === "--list-tools") opts.listTools = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (opts.format !== "json" && opts.format !== "compact") {
    throw new Error(
      `Invalid --format: ${opts.format} (must be 'json' or 'compact')`,
    );
  }

  if (!opts.listTools) {
    if (positional.length === 0) {
      throw new Error(
        "Missing tool name. Use --list-tools to discover tools, or pass a tool name as the first argument.",
      );
    }
    opts.toolName = positional[0];
    if (positional.length > 1) {
      try {
        opts.toolArgs = JSON.parse(positional[1]);
      } catch (err) {
        throw new Error(`Invalid JSON for tool args: ${err.message}`);
      }
    }
    if (positional.length > 2) {
      throw new Error(`Unexpected positional argument: ${positional[2]}`);
    }
  }

  return opts;
}

/**
 * GET /api/tools — returns the full envelope `{tools: [...]}` as parsed JSON.
 * The tool list endpoint always returns JSON; it has no `?format` toggle.
 */
async function listTools(baseUrl) {
  const res = await fetch(`${baseUrl}/api/tools`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Call a Producer Pal tool by name with the given args.
 *
 * In json format (the default), `result` is a parsed value (object/array/etc.)
 * and any warnings are surfaced as a separate `warnings: string[]` field. In
 * compact format, `result` is a token-efficient JS-literal string with
 * warnings inlined as `WARNING: ...` lines.
 */
async function callTool(baseUrl, name, args, { format, timeoutMs } = {}) {
  const params = new URLSearchParams({ format });
  if (timeoutMs != null) params.set("timeoutMs", String(timeoutMs));

  const res = await fetch(`${baseUrl}/api/tools/${name}?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  if (cli.listTools) {
    console.log(JSON.stringify(await listTools(cli.url), null, 2));
    return;
  }

  const response = await callTool(cli.url, cli.toolName, cli.toolArgs, {
    format: cli.format,
    timeoutMs: cli.timeoutMs,
  });
  if (response.isError) {
    console.error("API error:", response.result);
    process.exit(1);
  }
  console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
  if (err.cause?.code === "ECONNREFUSED") {
    console.error(
      "Could not connect to Producer Pal. Is Ableton Live running with the Producer Pal device?",
    );
  } else {
    console.error(err.message ?? err);
  }
  process.exit(1);
});
