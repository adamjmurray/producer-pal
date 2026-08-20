// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Entry point for the tool implementations with direct Live API access
import "./live-api-extensions.ts";
import "#src/polyfills/es2023-array.ts";

import { toCompactJSLiteral } from "#src/shared/compact/compact-serializer.ts";
import { MIN_LIVE_VERSION, VERSION } from "#src/shared/config.ts";
import {
  formatErrorResponse,
  formatSuccessResponse,
  MAX_ERROR_DELIMITER,
  planChunks,
  reassembleChunks,
} from "#src/shared/mcp-response-utils.ts";
import { textEditParamToString } from "#src/shared/max/max-atoms.ts";
import {
  DEFAULT_NOTATION,
  isNotation,
  type Notation,
} from "#src/shared/notation.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { deleteObject } from "#src/tools/actions/delete/delete.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { liveApi } from "#src/tools/advanced/live-api.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";
import { computeLoopDeadline } from "#src/tools/clip/helpers/loop-deadline.ts";
import { readClip } from "#src/tools/clip/read/read-clip.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { connect } from "#src/tools/core/connect.ts";
import { context as contextTool } from "#src/tools/core/context.ts";
import { createDevice } from "#src/tools/device/create/create-device.ts";
import { readDevice } from "#src/tools/device/read/read-device.ts";
import { updateDevice } from "#src/tools/device/update/update-device.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { updateLiveSet } from "#src/tools/live-set/update-live-set.ts";
import { createScene } from "#src/tools/scene/create-scene.ts";
import { readScene } from "#src/tools/scene/read-scene.ts";
import { updateScene } from "#src/tools/scene/update-scene.ts";
import { library } from "#src/tools/session/library.ts";
import { playback } from "#src/tools/session/playback.ts";
import { select } from "#src/tools/session/select.ts";
import { createTrack } from "#src/tools/track/create/create-track.ts";
import { readTrack } from "#src/tools/track/read/read-track.ts";
import { updateTrack } from "#src/tools/track/update/update-track.ts";
import { handleCodeExecResult } from "./code-exec-v8-protocol.ts";
import {
  beginLiveApiBuildStats,
  reportLiveApiBuildStats,
} from "./live-api-build-stats.ts";
import { beginLiveApiScope, endLiveApiScope } from "./live-api-release.ts";
import { handleNodeResponse } from "./node-request-v8-protocol.ts";
import {
  backupProjectContextOnEdit,
  noteProjectContextLoaded,
  syncProjectContextBackup,
} from "./project-context-sync.ts";

// Configure 2 outlets: MCP responses (0) and warnings (1)
outlets = 2;
setoutletassist(0, "tool call results");
setoutletassist(1, "tool call warnings");

/**
 * Persistent session-scoped state set by the Max patch via setter messages.
 * This object is the single source of truth for projectContext/smallModelMode/
 * sampleFolder; per-request contexts snapshot from it.
 */
interface SessionState {
  projectContext: { content: string };
  smallModelMode: boolean;
  notation: Notation;
  sampleFolder: string | null;
}

const sessionState: SessionState = {
  projectContext: {
    content: "",
  },
  smallModelMode: false,
  notation: DEFAULT_NOTATION,
  sampleFolder: null,
};

/**
 * Build a fresh per-request ToolContext that snapshots the persistent
 * session state and merges in request-scoped fields from the caller.
 * Concurrent in-flight requests get distinct contexts so a tool that
 * mutates its context can't leak state into another request. The
 * projectContext object is shared by reference so writes via ppal-context
 * immediately persist to sessionState (the Max textedit also receives the
 * update via the `update_project_context` outlet round-trip).
 *
 * @param incoming - Per-request fields parsed from the contextJSON arg
 * @returns Fresh ToolContext owned by the calling request
 */
function buildRequestContext(incoming: Partial<ToolContext>): ToolContext {
  const context: ToolContext = {
    projectContext: sessionState.projectContext,
    smallModelMode: sessionState.smallModelMode,
    notation: sessionState.notation,
    sampleFolder: sessionState.sampleFolder,
    ...incoming,
  };

  // One deadline for the whole request, set here and not at tool entry: a tool
  // that calls another (duplicate -> updateClip) would otherwise hand the nested
  // call a fresh full budget, so N of them can overrun the timeout together and
  // lose the response to it.
  context.deadline = computeLoopDeadline(context.timeoutMs);

  return context;
}

/*
**IMPORTANT**: Always pass args AND ctx to tool functions
Use the `(args, ctx) => toolFunction(args, ctx)` pattern
This ensures all tools have access to context (silenceWavPath, deadline, etc.)
Exception: ppal-connect takes args only — its signature intentionally dropped ctx
(see the `connect(args)` line below), so it does not follow this pattern.
*/
/* eslint-disable @typescript-eslint/no-explicit-any -- tools use dynamic dispatch with any types */
const toolDispatch: Record<
  string,
  (args: unknown, ctx: ToolContext) => unknown
> = {
  "ppal-connect": (args) => connect(args as any),
  "ppal-read-live-set": (args, ctx) => readLiveSet(args as any, ctx),
  "ppal-update-live-set": (args, ctx) => updateLiveSet(args as any, ctx),
  "ppal-create-track": (args, ctx) => createTrack(args as any, ctx),
  "ppal-read-track": (args, ctx) => readTrack(args as any, ctx),
  "ppal-update-track": (args, ctx) => updateTrack(args as any, ctx),
  "ppal-create-scene": (args, ctx) => createScene(args as any, ctx),
  "ppal-read-scene": (args, ctx) => readScene(args as any, ctx),
  "ppal-update-scene": (args, ctx) => updateScene(args as any, ctx),
  "ppal-create-clip": (args, ctx) => createClip(args as any, ctx),
  "ppal-read-clip": (args, ctx) => readClip(args as any, ctx),
  "ppal-update-clip": (args, ctx) => updateClip(args as any, ctx),
  "ppal-create-device": (args, ctx) => createDevice(args as any, ctx),
  "ppal-read-device": (args, ctx) => readDevice(args as any, ctx),
  "ppal-update-device": (args, ctx) => updateDevice(args as any, ctx),
  "ppal-playback": (args, ctx) => playback(args as any, ctx),
  "ppal-select": (args, ctx) => select(args as any, ctx),
  "ppal-delete": (args, ctx) => deleteObject(args as any, ctx),
  "ppal-duplicate": (args, ctx) => duplicate(args as any, ctx),
  "ppal-context": (args, ctx) => contextTool(args as any, ctx),
  "ppal-library": (args, ctx) => library(args as any, ctx),
  "ppal-live-api": (args, ctx) => liveApi(args as any, ctx),
};
/* eslint-enable @typescript-eslint/no-explicit-any -- end of tools dispatch section */

/**
 * Names of every tool the V8 adapter can dispatch. Exported so a parity test can
 * assert this hand-maintained map stays in sync with the registered tool defs
 * (STANDARD_TOOL_DEFS + the opt-in ppal-live-api) — a missing entry would make a
 * shipped tool fail at runtime with "Unknown tool".
 */
export const DISPATCH_TOOL_NAMES: readonly string[] = Object.keys(toolDispatch);

/**
 * Call a tool by name with the given arguments and per-request context.
 *
 * Exported for the docs generator, which runs the tools against a mock Live Set
 * to produce the example output in the tool reference. Going through the same
 * dispatch is what keeps those examples honest.
 *
 * @param toolName - Name of the tool to call
 * @param args - Arguments to pass to the tool
 * @param ctx - Per-request context for the tool
 * @returns Tool execution result
 */
export function callTool(
  toolName: string,
  args: object,
  ctx: ToolContext,
): unknown {
  const tool = toolDispatch[toolName];

  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  return tool(args, ctx);
}

let isCompactOutputEnabled = true;

/**
 * Enable or disable compact output format
 *
 * @param enabled - Whether to enable compact output
 */
export function compactOutput(enabled: unknown): void {
  isCompactOutputEnabled = Boolean(enabled);
}

/**
 * Enable or disable small model mode
 *
 * @param enabled - Whether to enable small model mode
 */
export function smallModelMode(enabled: unknown): void {
  sessionState.smallModelMode = Boolean(enabled);
}

/**
 * Set the global notation used by the clip tools' note read/write seams.
 * Invalid values are ignored (the current setting is kept).
 *
 * @param value - Notation name ("barbeat", "midi-json", or "stark")
 */
export function notation(value: unknown): void {
  if (isNotation(value)) {
    sessionState.notation = value;
  }
}

/**
 * Whether the next projectContext() call is the device's saved blob coming back
 * at load rather than a user edit. The blob reaches V8 through the same setter
 * either way — Live emits the textedit's embedded value when it restores the
 * device, and the ---v8-started / ---node-started bangs re-emit it — so a load
 * is indistinguishable from an edit by message alone. It IS separable by two
 * facts that hold whatever order Live, V8 and Node initialize in:
 *
 *   - The session's FIRST setter call is always a load echo. That is how the
 *     blob reaches V8 at all, and it lands before a user could plausibly type.
 *   - Every later load echo carries the SAME textedit content, so a set that
 *     changes nothing is never an edit (see the guard in projectContext()).
 *
 * Without this, opening an older Set in a Live Project backs its stale blob up
 * over the folder's newer shared sidecar. See dev/Memory-System.md.
 */
let expectLoadEcho = true;

/**
 * Set the project context content
 *
 * @param content - Project context content
 */
export function projectContext(content: unknown): void {
  // Scoped like a tool call: the backup below reads the Live Set's file path,
  // and that LiveAPI object's listener has to come down too. It is built before
  // the backup's first await, so the sync scope covers it.
  beginLiveApiScope();

  try {
    const value = textEditParamToString(content);
    const isLoadEcho = expectLoadEcho;

    expectLoadEcho = false;

    // A set that changes nothing can't be an edit: it's another load-time echo
    // of the blob we already hold (Live's textedit restore and the two -started
    // resync bangs all re-emit the same content, in no guaranteed order).
    const isEdit = !isLoadEcho && value !== sessionState.projectContext.content;

    sessionState.projectContext.content = value;

    if (isLoadEcho) noteProjectContextLoaded(value);

    // Device-UI and webui edits reach us only through this setter (never an MCP
    // tool call), so kick off a best-effort on-disk backup here too. Fire-and-
    // forget: the write is Node-side and must not block the param update, and
    // requestNode never rejects so this can't throw.
    if (isEdit) void backupProjectContextOnEdit(value);
  } finally {
    endLiveApiScope();
  }
}

/**
 * Apply a project-context blob restored from the on-disk backup: update the
 * session state and re-persist it into the Max device param via the same outlet
 * ppal-context uses. A null (no restore happened) is a no-op.
 *
 * Skips the apply when the param changed while the restore was in flight. A
 * `ppal-context` write landing in that window (two connected clients, or the
 * parallel tool calls a turn with subagents makes routine) is NEWER than the
 * sidecar blob this restore is carrying, so overwriting would silently revert
 * it in both memory and the device UI — after the tool already reported
 * success.
 *
 * @param restored - The restored blob, or null when nothing was restored
 * @param snapshot - The param's content when the restore was requested
 */
function applyRestoredProjectContext(
  restored: string | null,
  snapshot: string,
): void {
  if (restored == null) return;

  // Two session starts applying the SAME restore is not a divergence, even
  // though the second one's snapshot no longer matches. Nothing left to do.
  if (sessionState.projectContext.content === restored) return;

  if (sessionState.projectContext.content !== snapshot) {
    console.warn(
      "Project context changed while the backup restore was in flight; " +
        "keeping the newer content.",
    );

    return;
  }

  sessionState.projectContext.content = restored;
  outlet(0, "update_project_context", restored);
}

/**
 * Set the sample folder path
 *
 * @param path - Sample folder path
 */
export function sampleFolder(path: unknown): void {
  const value = textEditParamToString(path);

  sessionState.sampleFolder = value;
}

// The device fans the server's whole config outlet at both V8 and the Setup
// tab, so keys only the UI needs still arrive here. Max logs "no function <key>"
// for a config message V8 doesn't export, so each one needs a setter even when
// V8 ignores the value. Don't delete these as dead code — see the parity test in
// tests/config-key-parity.test.ts.

/**
 * Ignore the Direct Live API flag. The tool gate is entirely server-side: the
 * server decides whether to register ppal-live-api and rejects the name when
 * it's off, so anything reaching V8 has already passed that gate.
 */
export function liveApiEnabled(): void {}

/**
 * Ignore the enabled-tools whitelist. The server filters tool calls against it
 * before they reach V8.
 */
export function tools(): void {}

/**
 * Send a response back to the MCP server
 *
 * @param requestId - Request identifier
 * @param result - Result object to send
 */
function sendResponse(requestId: string, result: object): void {
  const jsonString = JSON.stringify(result);
  const { chunks, tooLargeError } = planChunks(jsonString);

  if (tooLargeError != null) {
    const errorResult = formatErrorResponse(tooLargeError);

    outlet(
      0,
      "mcp_response",
      requestId,
      JSON.stringify(errorResult),
      MAX_ERROR_DELIMITER,
    );

    return;
  }

  // Send as: ["mcp_response", requestId, chunk1, chunk2, ..., delimiter]
  outlet(0, "mcp_response", requestId, ...chunks, MAX_ERROR_DELIMITER);
}

/**
 * Handle code_exec_result message from Node after sandboxed code execution
 *
 * @param requestId - Request identifier
 * @param resultJson - JSON string of SandboxResult
 */
export function code_exec_result(requestId: string, resultJson: string): void {
  handleCodeExecResult(requestId, resultJson);
}

/**
 * Handle node_response message from Node after a node_request route ran.
 * Payload is chunked across the Max IPC boundary the same way mcp_response
 * is — args are: requestId, chunk1, ..., chunkN, MAX_ERROR_DELIMITER.
 *
 * @param requestId - Request identifier
 * @param rest - Payload chunks followed by MAX_ERROR_DELIMITER
 */
export function node_response(requestId: string, ...rest: unknown[]): void {
  let json: string;

  try {
    json = reassembleChunks(rest);
  } catch (error) {
    // Wire-format error (missing delimiter, etc.). Surface as a failure
    // response so the pending Promise resolves rather than hanging until
    // the 10s timeout — and log loudly so it shows in the Max console.
    const message = error instanceof Error ? error.message : String(error);

    console.error(
      `node_response wire-format error [requestId=${requestId}]: ${message}`,
    );
    json = JSON.stringify({ success: false, error: message });
  }

  handleNodeResponse(requestId, json);
}

// Handle messages from Node for Max
/**
 * Handle MCP request from Node for Max
 *
 * @param requestId - Request identifier
 * @param tool - Tool name to execute
 * @param argsJSON - JSON string of arguments
 * @param contextJSON - JSON string of context
 */
export async function mcp_request(
  requestId: string,
  tool: string,
  argsJSON: string,
  contextJSON?: string | null,
): Promise<void> {
  beginLiveApiScope();

  try {
    await handleRequest(requestId, tool, argsJSON, contextJSON);
  } finally {
    endLiveApiScope();
  }
}

/**
 * Run one tool call and send its response. Split out of mcp_request so the
 * LiveAPI release scope there wraps the whole request, response included.
 *
 * @param requestId - Request identifier
 * @param tool - Tool name to execute
 * @param argsJSON - JSON string of arguments
 * @param contextJSON - JSON string of context
 */
async function handleRequest(
  requestId: string,
  tool: string,
  argsJSON: string,
  contextJSON?: string | null,
): Promise<void> {
  let result;

  try {
    const args = JSON.parse(argsJSON) as Record<string, unknown>;

    // Build a fresh per-request context so concurrent in-flight requests
    // (possible whenever a tool awaits, e.g. code_exec) don't share state.
    let incomingContext: Partial<ToolContext> = {};

    if (contextJSON != null) {
      try {
        incomingContext = JSON.parse(contextJSON) as Partial<ToolContext>;
      } catch (contextError) {
        const message =
          contextError instanceof Error
            ? contextError.message
            : String(contextError);

        console.warn(`Failed to parse contextJSON: ${message}`);
      }
    }

    const requestContext = buildRequestContext(incomingContext);

    // Best-effort: keep the on-disk project-context backup in sync with the
    // current Live Set, and restore it into an empty param after a device
    // upgrade. Runs before the tool so a restored blob is visible to it — and,
    // for ppal-connect, to the Node-side injected project-context block. The
    // post-await write to sessionState lives in a helper so concurrent requests
    // don't trip require-atomic-updates.
    const contextBeforeSync = sessionState.projectContext.content;

    applyRestoredProjectContext(
      await syncProjectContextBackup(contextBeforeSync),
      contextBeforeSync,
    );

    // Counts only the tool's own objects, not the project-context sync above.
    // A build without ENABLE_BUILD_STATS gets a stub here and counts nothing.
    beginLiveApiBuildStats();

    try {
      // NOTE: toCompactJSLiteral() basically formats things as JS literal syntax with unquoted keys
      // Compare this to the old way of passing the JS object directly here,
      // which results in a JSON.stringify() call on the object inside formatSuccessResponse().
      // toCompactJSLiteral() doesn't save us a ton of tokens in most tools, so if we see any issues
      // with any LLMs, we can go back to omitting toCompactJSLiteral() here.
      const output = (await callTool(tool, args, requestContext)) as object;

      // Per-request override (REST ?format=json|compact) takes precedence
      // over the global compactOutput config.
      const useCompact = requestContext.compactOutput ?? isCompactOutputEnabled;

      result = formatSuccessResponse(
        useCompact ? toCompactJSLiteral(output) : output,
      );
    } catch (toolError) {
      const message =
        toolError instanceof Error ? toolError.message : String(toolError);

      result = formatErrorResponse(
        `Error executing tool '${tool}': ${message}`,
      );
    } finally {
      // Before the response is assembled: the patch appends whatever is on
      // outlet 1 at that moment, so reporting later files the numbers under
      // some other call. A failed call still built objects, hence the finally.
      reportLiveApiBuildStats();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    result = formatErrorResponse(`Error parsing tool call request: ${message}`);
  }

  // Send response back to Node for Max
  sendResponse(requestId, result);
}

const now = () => new Date().toLocaleString("sv-SE"); // YYYY-MM-DD HH:mm:ss

console.log(`[${now()}] Producer Pal ${VERSION} Live API adapter ready`);

// send a "started" signal so UI controls can resync their values
// while changing the code repeatedly during development. The patch answers it
// by banging the saved project-context textedit back at us, but not
// re-entrantly: this call returns before that echo arrives, which is why the
// load-vs-edit split in projectContext() can't be scoped to this statement.
outlet(0, "started");

/**
 * Check the Live version meets the minimum requirement.
 * Called by the Max patch after the device is fully loaded (LiveAPI is not available at top-level).
 */
export function checkLiveVersion(): void {
  beginLiveApiScope();

  try {
    // Live 12.4 returns "12.4" which Max V8 coerces to a number; force string.
    const liveVersion = String(
      LiveAPI.from("live_app").call("get_version_string"),
    );

    if (isNewerVersion(liveVersion, MIN_LIVE_VERSION)) {
      outlet(0, "min_live_version_not_met", liveVersion, MIN_LIVE_VERSION);
    }
  } finally {
    endLiveApiScope();
  }
}
