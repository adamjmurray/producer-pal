#!/usr/bin/env node

// Producer Pal REST API client (Node 18+, no dependencies).
//
// CLI:
//   node ppal.mjs --set-config '<json>'
//   node ppal.mjs --list-tools
//   node ppal.mjs <tool> [json-args] [options]
//
// Options:
//   --url <baseUrl>          override Producer Pal URL (default http://localhost:3350)
//   --timeout-ms <ms>        per-request timeout (1–60000)
//   --set-config <json>      update device settings, e.g. '{"notation":"midi-json"}'
//   --disable-tools <names>  withhold tools from this request (comma-separated)
//
// Examples:
//   node ppal.mjs --set-config '{"notation":"midi-json"}'
//   node ppal.mjs --list-tools
//   node ppal.mjs ppal-read-live-set
//   node ppal.mjs ppal-read-track '{"trackIndex": 0}'
//   node ppal.mjs ppal-create-clip '{...}' --timeout-ms 10000
//   node ppal.mjs ppal-connect --disable-tools ppal-library,ppal-create-device
//
// Library:
//   import { listTools, callTool, setConfig } from "./ppal.mjs";
//   const { result, warnings } = await callTool("ppal-read-live-set");

const DEFAULT_BASE_URL = "http://localhost:3350";

// Per-request tool subsetting. Unlike --set-config this changes nothing on the
// device: it applies to the one request that carries it, so it can't strip tools
// from the chat UI or another client.
const DISABLED_TOOLS_HEADER = "x-producer-pal-disabled-tools";

/**
 * Request headers withholding the given tool names, or none when the list is
 * empty. `disabledTools` is a string[] or a comma-separated string.
 */
function disabledToolsHeaders(disabledTools) {
  const names = (
    Array.isArray(disabledTools)
      ? disabledTools.join(",")
      : (disabledTools ?? "")
  ).trim();
  return names ? { [DISABLED_TOOLS_HEADER]: names } : {};
}

/**
 * GET /api/tools — returns the full envelope `{tools: [...]}` as a parsed
 * object. The tool list endpoint always returns JSON; it has no `?format`
 * toggle. `options.disabledTools` withholds tools from this catalog.
 */
export async function listTools(baseUrl = DEFAULT_BASE_URL, options = {}) {
  const res = await fetch(`${baseUrl}/api/tools`, {
    headers: disabledToolsHeaders(options.disabledTools),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Call a Producer Pal tool by name. The REST API defaults to `format=json`, so
 * `result` is a parsed value (object/array/etc.) and warnings are surfaced as a
 * separate `warnings: string[]` field.
 *
 * `options.disabledTools` withholds tools from this request: a withheld tool
 * 404s, and `ppal-connect` returns a Skills blob with the fragments teaching
 * those tools left out. Pass the same list on every call in a session.
 */
export async function callTool(name, args = {}, options = {}) {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const params = new URLSearchParams();
  if (options.timeoutMs != null)
    params.set("timeoutMs", String(options.timeoutMs));

  const query = params.toString();
  const url = query
    ? `${baseUrl}/api/tools/${name}?${query}`
    : `${baseUrl}/api/tools/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...disabledToolsHeaders(options.disabledTools),
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * POST /config — update device settings remotely and return the full updated
 * config. `patch` is a partial object; the server ignores unrecognized keys and
 * also silently ignores an invalid value for a known field (an unknown
 * `notation` is dropped, keeping the current setting; booleans are coerced). The
 * only field that rejects with a 400 is an invalid `tools` list. Because bad
 * values are dropped rather than reported, read the returned config to confirm a
 * setting actually took effect. The main use for coding agents is the active
 * MIDI notation, e.g. `setConfig({ notation: "midi-json" })`; pass
 * `{ liveApiEnabled: true }` to turn on the advanced `ppal-live-api` tool. The
 * setting is global to the device (it also affects the chat UI and any
 * connected MCP clients).
 */
export async function setConfig(patch, options = {}) {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const res = await fetch(`${baseUrl}/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- CLI ---

function parseArgs(argv) {
  const opts = { baseUrl: DEFAULT_BASE_URL, listTools: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url") opts.baseUrl = argv[++i];
    else if (arg === "--timeout-ms") opts.timeoutMs = Number(argv[++i]);
    else if (arg === "--list-tools") opts.listTools = true;
    else if (arg === "--set-config") opts.setConfig = argv[++i];
    else if (arg === "--disable-tools") opts.disabledTools = argv[++i];
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else positional.push(arg);
  }
  return { opts, positional };
}

const HELP = `Producer Pal REST API client

Usage:
  node ppal.mjs --set-config '<json>'
  node ppal.mjs --list-tools
  node ppal.mjs <tool> [json-args] [options]

Options:
  --url <baseUrl>          override Producer Pal URL (default ${DEFAULT_BASE_URL})
  --timeout-ms <ms>        per-request timeout (1–60000)
  --set-config <json>      update device settings, e.g. '{"notation":"midi-json"}'
  --disable-tools <names>  withhold tools from this request (comma-separated
                           tool names). Per request, not a device setting.
  --help, -h               show this help

Examples:
  node ppal.mjs --set-config '{"notation":"midi-json"}'
  node ppal.mjs --list-tools
  node ppal.mjs ppal-read-live-set
  node ppal.mjs ppal-read-track '{"trackIndex": 0}'
  node ppal.mjs ppal-connect --disable-tools ppal-library,ppal-create-device
`;

async function main(argv) {
  const { opts, positional } = parseArgs(argv);
  if (opts.help) {
    console.log(HELP);
    return;
  }

  if (opts.listTools) {
    const result = await listTools(opts.baseUrl, opts);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (opts.setConfig != null) {
    let patch;
    try {
      patch = JSON.parse(opts.setConfig);
    } catch (err) {
      console.error(`Invalid JSON for --set-config: ${err.message}`);
      process.exit(1);
    }
    const updated = await setConfig(patch, opts);
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  const [toolName, argsJson = "{}"] = positional;
  if (!toolName) {
    console.error(
      "Missing tool name. Use --list-tools to discover tools, or pass a tool name as the first argument.",
    );
    process.exit(1);
  }

  let args;
  try {
    args = JSON.parse(argsJson);
  } catch (err) {
    console.error(`Invalid JSON for tool args: ${err.message}`);
    process.exit(1);
  }

  const response = await callTool(toolName, args, opts);
  if (response.isError) {
    console.error(`API error: ${response.result}`);
    process.exit(1);
  }
  console.log(JSON.stringify(response, null, 2));
}

// Run main() when invoked as CLI (not when imported as a library)
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    if (err.cause?.code === "ECONNREFUSED") {
      console.error(
        "Could not connect to Producer Pal. Is Ableton Live running with the Producer Pal device?",
      );
    } else {
      console.error(err.message ?? err);
    }
    process.exit(1);
  }
}
