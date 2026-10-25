// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for the project-context backup sidecar — the "Producer Pal Project
 * Context.md" file written beside the Live Set so the per-Set notes survive a
 * device upgrade, which wipes the device's own param.
 *
 * Spans the filesystem AND the Live API: V8 pulls the Set's file_path on every
 * tool call and asks Node to reconcile the param against the file. Unit tests
 * cover each half; only a real Live Set can show the two meeting.
 *
 * The restore case needs a device that comes up empty with the file already
 * there, so it reopens the Live Set itself rather than relying on the harness's
 * reopen (which runs before the test body could write anything). So do the
 * shared-folder cases, which switch between two Sets in one project folder.
 *
 * Uses: e2e-test-set - any track (no clips are touched); tracks-test and
 * tracks-test-twin, which share a folder, the twin saved with stale context
 * See: e2e/live-sets/specs/e2e-test-set-spec.md,
 * e2e/live-sets/specs/tracks-test-spec.md
 *
 * Run with: npm run e2e:mcp -- project-context-sidecar
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, describe, expect, it } from "vitest";
import { connectMcp } from "#evals/chat/mcp.ts";
import { MCP_URL } from "#evals/shared/mcp-url.ts";
import { openLiveSet } from "#evals/scenarios/open-live-set.ts";
import {
  CONFIG_URL,
  LIVE_SET_PATH,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import { TRACKS_TEST_PATH, TRACKS_TEST_TWIN_PATH } from "../e2e-test-set.ts";

// Reopens the Live Set before EACH test: the V8 side answers "was this param
// wiped by a device load?" from state that only a device reload resets, so these
// tests can't share one.
const ctx = setupMcpTestContext();

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The sidecar beside a Live Set. Keyed on the project FOLDER, not the .als
 * basename — every Set in a Live Project shares one file.
 * @param liveSetPath - The Set's repo-relative path
 * @returns The sidecar's absolute path
 */
function sidecarFor(liveSetPath: string): string {
  return join(
    dirname(resolve(__dirname, "../../..", liveSetPath)),
    "Producer Pal Project Context.md",
  );
}

const SIDECAR = sidecarFor(LIVE_SET_PATH);
/** Shared by tracks-test and tracks-test-twin. */
const TRACKS_SIDECAR = sidecarFor(TRACKS_TEST_PATH);
/** The project context tracks-test-twin was saved with. */
const TWIN_CONTEXT = "Stale notes saved in tracks-test-twin";

/** How long a fire-and-forget backup gets to reach the disk. */
const SETTLE_MS = 3000;

afterAll(() => {
  // The file is gitignored, but every other suite's project-context assertions
  // start from the device param — leaving a stale backup here would restore it
  // into the next suite that reopens the Set.
  rmSync(SIDECAR, { force: true });
  rmSync(TRACKS_SIDECAR, { force: true });
});

/**
 * Wait for a condition, polling until it holds or the deadline passes. The
 * backup is fire-and-forget on the V8 side, so a tool call returning doesn't
 * mean the file has landed.
 * @param condition - Checked repeatedly
 * @returns Whether it held before the deadline
 */
async function eventually(
  condition: () => boolean | Promise<boolean>,
): Promise<boolean> {
  for (let waited = 0; waited < SETTLE_MS; waited += 100) {
    if (await condition()) {
      return true;
    }

    await sleep(100);
  }

  return condition();
}

/**
 * Write the project context the way the device UI and the chat settings do (the
 * param setter), which is a genuine edit and so may overwrite the sidecar.
 * @param content - The blob to store
 */
async function setProjectContext(content: string): Promise<void> {
  await setConfig({ projectContext: content });
}

/**
 * The project context the server currently holds.
 * @returns The blob, or "" when unset
 */
async function readProjectContext(): Promise<string> {
  const response = await fetch(CONFIG_URL);
  const config = (await response.json()) as { projectContext?: string };

  return config.projectContext ?? "";
}

/**
 * Whether tracks-test's sidecar exists and holds exactly `content`.
 * @param content - The expected blob
 * @returns True when it does
 */
function sidecarHolds(content: string): boolean {
  return (
    existsSync(TRACKS_SIDECAR) &&
    readFileSync(TRACKS_SIDECAR, "utf8") === content
  );
}

/**
 * Open a Live Set and run `body` against its server. Opening a Set reloads the
 * device, which resets the V8 side's "was the param wiped?" state.
 * @param liveSetPath - The Set to open
 * @param body - Runs once the Set serves MCP
 */
async function inLiveSet(
  liveSetPath: string,
  body: (client: Client) => Promise<void>,
): Promise<void> {
  await openLiveSet(liveSetPath);
  await ctx.client!.close();

  const { client, transport } = await connectMcp(MCP_URL);

  try {
    await body(client);
  } finally {
    await client.close();
    await transport.close();
  }
}

/**
 * Run any tool call: the sync runs ahead of every one of them.
 * @param client - The connected client
 */
async function anyToolCall(client: Client): Promise<void> {
  await client.callTool({ name: "ppal-read-live-set", arguments: {} });
}

describe("project context sidecar", () => {
  it("backs a written context up to a file beside the Live Set", async () => {
    const CONTENT = "- Genre: e2e techno.\n- Sidecar backup probe.";

    rmSync(SIDECAR, { force: true });
    // A tool call first: it settles the wipe question, which is what lets the
    // edit below overwrite a backup rather than protecting one it can't see.
    await ctx.client!.callTool({ name: "ppal-read-live-set", arguments: {} });
    await setProjectContext(CONTENT);

    expect(await eventually(() => existsSync(SIDECAR))).toBe(true);
    // Byte-for-byte: the file is the raw blob, so it stays hand-editable and
    // round-trips without a format in the middle.
    expect(readFileSync(SIDECAR, "utf8")).toBe(CONTENT);
  });

  it("deletes the sidecar when the context is cleared", async () => {
    const CONTENT = "- Cleared in a moment.";

    await ctx.client!.callTool({ name: "ppal-read-live-set", arguments: {} });
    await setProjectContext(CONTENT);
    expect(await eventually(() => existsSync(SIDECAR))).toBe(true);

    // Without this the next device load would restore what the user just
    // deleted — the clear has to reach the disk, not only the param.
    await setProjectContext("");

    expect(await eventually(() => !existsSync(SIDECAR))).toBe(true);
  });

  it("restores the sidecar into a device that came up with an empty context", async () => {
    // The upgrade-wipe case the whole feature exists for: the device param is
    // blank because a device (re)load blanked it, and the file beside the Set is
    // the only surviving copy.
    const CONTENT = "- Restored from the sidecar by the first tool call.";

    writeFileSync(SIDECAR, CONTENT, "utf8");

    // A real reload, so V8 comes up with the restore still unspent. The
    // harness's own reopen already ran, before this test could write the file.
    await inLiveSet(LIVE_SET_PATH, async (client) => {
      expect(await readProjectContext()).toBe("");

      await anyToolCall(client);

      expect(
        await eventually(async () => (await readProjectContext()) === CONTENT),
      ).toBe(true);
    });
  });
});

describe("project context sidecar shared by two Sets in one folder", () => {
  it("doesn't overwrite the folder's sidecar with a Set's stale context", async () => {
    const SHARED = "- Notes the folder already holds.";

    writeFileSync(TRACKS_SIDECAR, SHARED, "utf8");

    await inLiveSet(TRACKS_TEST_TWIN_PATH, async (client) => {
      expect(await readProjectContext()).toBe(TWIN_CONTEXT);

      await anyToolCall(client);
      // The backup is fire-and-forget: give a wrong one time to land.
      await sleep(SETTLE_MS);

      expect(readFileSync(TRACKS_SIDECAR, "utf8")).toBe(SHARED);
      expect(await readProjectContext()).toBe(TWIN_CONTEXT);
    });
  });

  it("keeps the last Set's edit, and restores it into the other Set", async () => {
    const MAIN_EDIT = "- Written from tracks-test.";
    const TWIN_EDIT = "- Written from tracks-test-twin, last.";

    rmSync(TRACKS_SIDECAR, { force: true });

    await inLiveSet(TRACKS_TEST_PATH, async (client) => {
      await anyToolCall(client);
      await setProjectContext(MAIN_EDIT);

      expect(await eventually(() => sidecarHolds(MAIN_EDIT))).toBe(true);
    });

    await inLiveSet(TRACKS_TEST_TWIN_PATH, async (client) => {
      await anyToolCall(client);
      await setProjectContext(TWIN_EDIT);

      expect(await eventually(() => sidecarHolds(TWIN_EDIT))).toBe(true);
    });

    // Reopened unsaved, so its own edit is gone and the param comes up empty.
    await inLiveSet(TRACKS_TEST_PATH, async (client) => {
      expect(await readProjectContext()).toBe("");

      await anyToolCall(client);

      expect(
        await eventually(
          async () => (await readProjectContext()) === TWIN_EDIT,
        ),
      ).toBe(true);
    });
  });
});
