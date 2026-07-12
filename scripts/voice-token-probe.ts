#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Voice token probe: quantify the per-turn INPUT token cost of a Producer Pal
 * voice session, isolating the re-billed context (agent instructions, MCP tool
 * schemas, and the ppal-connect skills blob).
 *
 * The OpenAI Realtime API re-bills the full accumulated input context on every
 * response, so a large fixed payload (e.g. the ~9.8k-token standard skills
 * blob) is paid again every turn and dominates the TPM rate-limit accounting.
 * This probe connects headless over the SDK's WebSocket transport (no mic / no
 * WebRTC / text-only so it is cheap and deterministic) and reads the `usage`
 * block off each response to measure that cost directly under several context
 * configurations.
 *
 * Usage:
 *   node scripts/voice-token-probe.ts            # all scenarios, 3 turns each
 *   node scripts/voice-token-probe.ts --turns 2  # fewer turns (cheaper)
 *
 * Requires OPENAI_KEY in .env (see .env.example).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Tool } from "@openai/agents";
import {
  OpenAIRealtimeWebSocket,
  RealtimeAgent,
  RealtimeSession,
  tool,
  type RealtimeItem,
} from "@openai/agents/realtime";
import { z, type ZodType } from "zod";
import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import { type Notation, DEFAULT_NOTATION } from "#src/shared/notation.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import { filterSchemaForSmallModel } from "#src/tools/shared/tool-framework/filter-schema.ts";
import {
  resolveModalDescription,
  resolveParamModes,
} from "#src/tools/shared/tool-framework/modal-config.ts";
import {
  buildOpenAIVoiceInstructions,
  getVoiceLanguage,
} from "#webui/lib/constants/voice-language.ts";

// Inlined from #webui/lib/constants/models.ts: importing that module raw pulls
// in extensionless webui imports Node can't resolve unbundled. Keep in sync.
const OPENAI_REALTIME_MODEL = "gpt-realtime-2";

// Sourced through buildSkills (HEADER + notation head + shared core per level).
// Standard = default (bar|beat); basic = Stark, matching the historical baseline.
const standardSkills = buildSkills();
const basicSkills = buildSkills({ notation: "stark", smallModelMode: true });

/** A measured response's token usage (the realtime `usage` block, normalized). */
interface TurnUsage {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** One context configuration to measure. */
interface Scenario {
  label: string;
  /** none = no tools; full = all schemas as-is; small = small-model-mode filtered. */
  tools: "none" | "full" | "small";
  /** Skills blob seeded as a prior turn (simulating a ppal-connect result), or none. */
  skills: "none" | "standard" | "basic";
}

const SCENARIOS: Scenario[] = [
  { label: "bare (instructions only)", tools: "none", skills: "none" },
  { label: "+ full tool schemas", tools: "full", skills: "none" },
  {
    label: "+ full tools + standard skills (PRODUCTION)",
    tools: "full",
    skills: "standard",
  },
  { label: "+ full tools + basic skills", tools: "full", skills: "basic" },
  {
    label: "+ small-model tools + basic skills (PROPOSED MIN)",
    tools: "small",
    skills: "basic",
  },
];

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}

/**
 * Run every scenario and print a comparison table.
 * @returns Resolves when all scenarios have been measured
 */
async function main(): Promise<void> {
  const apiKey = loadEnvKey("OPENAI_KEY");
  const turns = parseTurnsArg();

  console.log(
    `\nVoice token probe — model ${OPENAI_REALTIME_MODEL}, ${turns} turns/scenario, text-only\n`,
  );
  console.log(`Tool schemas: ${STANDARD_TOOL_DEFS.length} tools`);
  console.log(
    `Skills blobs: standard ~${estimateTokens(standardSkills)} tok, basic ~${estimateTokens(basicSkills)} tok\n`,
  );

  const rows: { label: string; usages: TurnUsage[] }[] = [];

  for (const scenario of SCENARIOS) {
    process.stdout.write(`Measuring: ${scenario.label} ... `);
    const usages = await measureScenario(apiKey, scenario, turns);

    rows.push({ label: scenario.label, usages });
    console.log("done");
  }

  printTable(rows, turns);
}

/**
 * Connect a headless realtime session for one scenario and measure input-token
 * usage across N turns.
 * @param apiKey - OpenAI API key
 * @param scenario - The context configuration to measure
 * @param turns - Number of user turns to send
 * @returns Per-turn usage records
 */
async function measureScenario(
  apiKey: string,
  scenario: Scenario,
  turns: number,
): Promise<TurnUsage[]> {
  const lang = getVoiceLanguage("en");
  // Match the tools' notation to the scenario's skills blob (basic = Stark,
  // standard/none = the bar|beat default) so the modal tool AND param
  // descriptions resolve to the same cell production ships, not always the
  // bar|beat one.
  const notation: Notation =
    scenario.skills === "basic" ? "stark" : DEFAULT_NOTATION;
  const agent = new RealtimeAgent({
    name: "Producer Pal Voice",
    instructions: buildOpenAIVoiceInstructions(lang),
    tools:
      scenario.tools === "none"
        ? []
        : buildAgentTools(scenario.tools, notation),
  });

  const transport = new OpenAIRealtimeWebSocket();
  const session = new RealtimeSession(agent, {
    model: OPENAI_REALTIME_MODEL,
    transport,
    config: {
      // Text-only keeps the probe cheap and isolates the INPUT context cost
      // (the re-billed skills/tools payload) from per-turn audio tokens.
      outputModalities: ["text"],
    },
  });

  const usages: TurnUsage[] = [];
  const waiters: Array<(u: TurnUsage) => void> = [];

  transport.on("*", (event: unknown) => {
    const e = event as { type?: string; response?: { usage?: RawUsage } };

    if (e.type === "response.done" && e.response?.usage) {
      const u = normalizeUsage(e.response.usage);

      usages.push(u);
      waiters.shift()?.(u);
    }
  });

  await session.connect({ apiKey });

  // Seed the skills blob as a prior turn, mirroring the post-connect state where
  // ppal-connect's result already sits in the conversation.
  if (scenario.skills !== "none") {
    const blob = scenario.skills === "standard" ? standardSkills : basicSkills;

    session.updateHistory([skillsHistoryItem(blob)]);
  }

  for (let i = 0; i < turns; i++) {
    const next = new Promise<TurnUsage>((resolve) => waiters.push(resolve));

    sendUserTurn(session, `Turn ${i + 1}: acknowledge in one short word.`);
    await next;
  }

  transport.close();

  return usages;
}

/**
 * Build the OpenAI Realtime SDK tool list from the standard MCP tool defs,
 * converting each Zod input schema to JSON Schema exactly as the MCP server's
 * listTools does (the realtime agent uploads these per session).
 * @param mode - "full" = large-model schemas (notation param overrides only);
 *   "small" = additionally small-model-filtered (excludeParams + small-model
 *   descriptionOverrides + toolDescription override). Both filter like define-tool.
 * @param notation - Active notation, matching the scenario's skills blob, so the
 *   modal tool/param descriptions resolve to the SAME cell production uploads
 * @returns SDK tool descriptors (execute is a no-op; we only measure schema cost)
 */
function buildAgentTools(mode: "full" | "small", notation: Notation): Tool[] {
  return STANDARD_TOOL_DEFS.map((td) => toRealtimeTool(td, mode, notation));
}

/**
 * Convert one tool def into a Realtime SDK tool, mirroring realtime-mcp-tools.ts
 * (JSON Schema from Zod, strict disabled, no-op executor — we only measure the
 * uploaded schema's token cost, never execute).
 * @param td - A standard tool definition
 * @param mode - "full" or "small"; both resolve param modes via resolveParamModes
 *   (full = notation only, small = notation + small-model) and filter the schema
 *   unconditionally, exactly as define-tool.ts does
 * @param notation - Active notation; feeds the modal-config key ladder alongside
 *   smallModelMode so descriptions/enums resolve to the production cell
 * @returns A Realtime SDK tool
 */
function toRealtimeTool(
  td: (typeof STANDARD_TOOL_DEFS)[number],
  mode: "full" | "small",
  notation: Notation,
): Tool {
  const smallModelMode = mode === "small";
  const resolved = resolveParamModes(td.toolOptions.inputSchema, {
    smallModelMode,
    notation,
  });
  // Filter unconditionally, exactly as production's define-tool.ts does:
  // resolveParamModes already folded in the notation cell, so even large-model
  // ("full") mode ships the active notation's param overrides (e.g. the stark
  // `notes` descriptions on create-clip/update-clip). Gating this on
  // smallModelMode undercounted a large-model stark session's schema tokens.
  const inputSchema = filterSchemaForSmallModel(
    td.toolOptions.inputSchema,
    resolved.excludeParams,
    resolved.descriptionOverrides,
    resolved.excludeEnumValues,
  );
  const description = resolveModalDescription(td.toolOptions.description, {
    smallModelMode,
    notation,
  });

  return tool({
    name: td.toolName,
    description,
    parameters: toNonStrictSchema(inputSchema),
    strict: false,
    execute: async () => "",
  });
}

/** The non-strict JSON-Schema shape the Realtime SDK's tool() accepts. */
interface JsonObjectSchemaNonStrict {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: true;
}

/**
 * Convert a Zod input schema to the non-strict JSON Schema the Realtime SDK
 * expects, mirroring realtime-mcp-tools.ts's normalizeJsonSchema so the
 * uploaded payload (and thus the token count) matches production.
 * @param inputSchema - The tool's Zod input schema map
 * @returns A non-strict JSON object schema
 */
function toNonStrictSchema(
  inputSchema: Record<string, ZodType>,
): JsonObjectSchemaNonStrict {
  const json = z.toJSONSchema(z.object(inputSchema)) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };

  return {
    type: "object",
    properties: json.properties ?? {},
    required: json.required ?? [],
    additionalProperties: true,
  };
}

/**
 * Build a conversation history item carrying the skills blob, simulating the
 * ppal-connect tool result already present in a live session's context.
 * @param blob - The skills text
 * @returns A user-role message item the SDK will re-seed to the server
 */
function skillsHistoryItem(blob: string): RealtimeItem {
  return {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: blob }],
  } as RealtimeItem;
}

/** Raw realtime usage block (only the fields we read). */
interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_token_details?: { cached_tokens?: number };
}

/**
 * Normalize a raw realtime usage block.
 * @param u - Raw usage from response.done
 * @returns Normalized token counts
 */
function normalizeUsage(u: RawUsage): TurnUsage {
  return {
    inputTokens: u.input_tokens ?? 0,
    cachedTokens: u.input_token_details?.cached_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    totalTokens: u.total_tokens ?? 0,
  };
}

/**
 * Send one user text turn and request a (tiny) response.
 * @param session - The active realtime session
 * @param text - The user message text
 */
function sendUserTurn(session: RealtimeSession, text: string): void {
  session.transport.sendEvent({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text }],
    },
  });
  session.transport.sendEvent({
    type: "response.create",
    response: { max_output_tokens: 16 },
  });
}

/**
 * Render the comparison table: per-turn input tokens for each scenario, plus the
 * delta attributable to each added context layer.
 * @param rows - Measured scenarios
 * @param turns - Turns per scenario
 */
function printTable(
  rows: { label: string; usages: TurnUsage[] }[],
  turns: number,
): void {
  console.log("\n=== INPUT tokens per turn (billed every response) ===\n");
  const header = ["scenario".padEnd(42), ...turnHeaders(turns)].join(" ");

  console.log(header);
  console.log("-".repeat(header.length));

  for (const row of rows) {
    const cells = row.usages.map((u) =>
      `${u.inputTokens}(${u.cachedTokens}c)`.padStart(11),
    );

    console.log(`${row.label.padEnd(42)} ${cells.join(" ")}`);
  }

  console.log("\n(N(Mc) = N input tokens, M of them cached)\n");
}

/**
 * Column headers for each turn.
 * @param turns - Turn count
 * @returns Padded header strings
 */
function turnHeaders(turns: number): string[] {
  return Array.from({ length: turns }, (_, i) => `turn${i + 1}`.padStart(11));
}

/**
 * Crude token estimate (chars / 4) for the summary line.
 * @param text - Text to estimate
 * @returns Approximate token count
 */
function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

/**
 * Read --turns from argv, defaulting to 3.
 * @returns Turn count (>= 1)
 */
function parseTurnsArg(): number {
  const idx = process.argv.indexOf("--turns");

  if (idx === -1) return 3;
  const n = Number.parseInt(process.argv[idx + 1] ?? "", 10);

  return Number.isFinite(n) && n >= 1 ? n : 3;
}

/**
 * Load a single key from the project .env (simple KEY=VALUE parse; first match
 * on an uncommented line wins).
 * @param name - The env var name
 * @returns The value
 */
function loadEnvKey(name: string): string {
  const envPath = fileURLToPath(new URL("../.env", import.meta.url));
  const text = readFileSync(envPath, "utf8");

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");

    if (key?.trim() === name) return rest.join("=").trim();
  }

  throw new Error(`${name} not found in .env (see .env.example)`);
}
