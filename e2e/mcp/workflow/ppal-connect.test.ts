// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-connect tool
 * Uses once mode to reuse MCP connection across tests (faster).
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import { buildSkills } from "#src/skills/build-skills.ts";
import {
  CONFIG_URL,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

/** Helper to call ppal-connect and return the raw MCP result. */
async function callConnectRaw(): Promise<unknown> {
  return ctx.client!.callTool({ name: "ppal-connect", arguments: {} });
}

/**
 * Extract the injected connect content block whose text starts with `prefix`,
 * or "" when absent. Skills, project context, global context, and memory are
 * each appended Node-side as their own labeled content block (see
 * create-express-app.ts), not carried in the ppal-connect JSON body.
 */
function extractBlock(result: unknown, prefix: string): string {
  const typed = result as {
    content?: Array<{ text?: string; type?: string }>;
  } | null;

  return typed?.content?.find((c) => c.text?.startsWith(prefix))?.text ?? "";
}

/** Extract the injected "# Producer Pal Skills" block (see {@link extractBlock}). */
function extractSkills(result: unknown): string {
  return extractBlock(result, "# Producer Pal Skills");
}

/**
 * The position of the first content block whose text starts with `prefix`, or -1
 * when absent. Unlike {@link extractBlock} (which finds a block by prefix
 * regardless of position), this exposes ORDER, so a test can assert the injected
 * blocks appear in the documented skills → project → global → memory sequence.
 */
function blockIndex(result: unknown, prefix: string): number {
  const typed = result as {
    content?: Array<{ text?: string }>;
  } | null;

  return typed?.content?.findIndex((c) => c.text?.startsWith(prefix)) ?? -1;
}

describe("ppal-connect", () => {
  it("returns standard mode skills (smallModelMode=false)", async () => {
    // Ensure standard mode is active, with notation pinned so the assertion is
    // deterministic regardless of any notation left set by a prior test.
    await setConfig({ smallModelMode: false, notation: "barbeat" });
    const result = await callConnectRaw();
    const parsed = parseToolResult<ConnectResult>(result);

    // Connection status
    expect(parsed.connected).toBe(true);
    expect(parsed.producerPalVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.abletonLiveVersion).toBeDefined();
    expect(typeof parsed.abletonLiveVersion).toBe("string");
    expect(parsed.abletonLiveVersion).toMatch(/^\d+\.\d+(\.\d+)?$/);

    // Live Set info
    expect(parsed.liveSet).toBeDefined();
    expect(typeof parsed.liveSet.regularTrackCount).toBe("number");
    expect(typeof parsed.liveSet.returnTrackCount).toBe("number");
    expect(typeof parsed.liveSet.sceneCount).toBe("number");
    expect(parsed.liveSet.tempo).toBeDefined();
    expect(
      parsed.liveSet.timeSignature === null ||
        /^\d+\/\d+$/.test(parsed.liveSet.timeSignature),
    ).toBe(true);

    // Standard mode injects the assembled standard skills verbatim (no user
    // overrides expected on the dev machine during e2e). Asserting equality with
    // buildSkills() (rather than hand-picked content markers like section
    // headings) means any future skills reorg flows through automatically — this
    // test can never silently drift out of sync with the skills.
    expect(extractSkills(result)).toBe(buildSkills({ notation: "barbeat" }));
  });

  it("returns simplified skills (smallModelMode=true)", async () => {
    // Enable small model mode, notation pinned (see standard-mode test above).
    await setConfig({ smallModelMode: true, notation: "barbeat" });
    const result = await callConnectRaw();
    const parsed = parseToolResult<ConnectResult>(result);

    // Connection status still works
    expect(parsed.connected).toBe(true);
    expect(parsed.producerPalVersion).toMatch(/^\d+\.\d+\.\d+$/);

    // Small model mode injects the notation's basic skills verbatim — and,
    // crucially, something different from standard mode, proving the mode
    // switch actually changed what the live server serves.
    const skills = extractSkills(result);

    expect(skills).toBe(
      buildSkills({ notation: "barbeat", smallModelMode: true }),
    );
    expect(skills).not.toBe(buildSkills({ notation: "barbeat" }));
  });

  describe("project context", () => {
    // config.projectContext is the per-Live-Set project context blob — the field
    // name predates the memory system. It is no longer embedded in the connect
    // JSON; it's injected Node-side as its own "Project context (this Live Set):"
    // block (the same shape as the skills/global/memory blocks).
    const TEST_CONTEXT = "Test project context for e2e testing";
    const PROJECT_CONTEXT_PREFIX = "Project context (this Live Set):";

    it("injects a project context block when content is non-empty", async () => {
      await setConfig({ projectContext: TEST_CONTEXT });
      const result = await callConnectRaw();

      expect(extractBlock(result, PROJECT_CONTEXT_PREFIX)).toBe(
        `${PROJECT_CONTEXT_PREFIX}\n\n${TEST_CONTEXT}`,
      );
    });

    it("omits the project context block when content is empty", async () => {
      await setConfig({ projectContext: "" });
      const result = await callConnectRaw();

      expect(extractBlock(result, PROJECT_CONTEXT_PREFIX)).toBe("");
    });
  });

  describe("memory index", () => {
    // The memory index (a flat `name — description` list of the user's
    // ~/.producer-pal/memory/ entries) is injected Node-side as its own
    // "Memory index —" block in standard mode, but SKIPPED in small-model mode:
    // that mode's ppal-context surface drops scope=memory, so an index pointing
    // at those actions would dead-end (see memory-inject.ts).
    const MEMORY_INDEX_PREFIX = "Memory index";
    const MEMORY_NAME = "e2e-memory-index-probe";
    const MEMORY_URL = `${CONFIG_URL.replace("/config", "")}/memory/${MEMORY_NAME}`;

    it("injects the index in standard mode but omits it in small-model mode", async () => {
      // Seed a transient memory so the standard-mode presence is real, not
      // vacuous. Localhost write — a node fetch sends no Origin, so it passes
      // the collection route's foreign-origin gate.
      const putRes = await fetch(MEMORY_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "e2e probe body",
          description: "e2e probe — safe to delete",
        }),
      });

      try {
        expect(putRes.ok).toBe(true);

        // Standard mode: the index block is present and lists the probe entry.
        await setConfig({ smallModelMode: false });
        expect(
          extractBlock(await callConnectRaw(), MEMORY_INDEX_PREFIX),
        ).toContain(MEMORY_NAME);

        // Small-model mode: no memory index block at all.
        await setConfig({ smallModelMode: true });
        expect(extractBlock(await callConnectRaw(), MEMORY_INDEX_PREFIX)).toBe(
          "",
        );
      } finally {
        // Always restore standard mode and delete the probe so the dev machine's
        // real ~/.producer-pal/memory/ is left untouched.
        await setConfig({ smallModelMode: false });
        await fetch(MEMORY_URL, { method: "DELETE" });
      }
    });
  });

  describe("injected block order", () => {
    // The per-block tests above use extractBlock, which finds a block by prefix
    // regardless of its position — so none of them catch a reordered
    // composition. This locks the documented sequence: because
    // withMemory(withGlobalContext(withProjectContext(withSkills(…)))) pushes
    // inner-to-outer, the appended content[] blocks must run
    // skills → project → global → memory. Seed all three context layers so every
    // block is present and the ordering check is real, not vacuous.
    const SKILLS_PREFIX = "# Producer Pal Skills";
    const PROJECT_PREFIX = "Project context (this Live Set):";
    const GLOBAL_PREFIX = "Global context (all projects):";
    const MEMORY_PREFIX = "Memory index";
    const ROOT_URL = CONFIG_URL.replace("/config", "");
    const GLOBAL_CONTEXT_URL = `${ROOT_URL}/global-context`;
    const ORDER_MEMORY_NAME = "e2e-connect-order-probe";
    const ORDER_MEMORY_URL = `${ROOT_URL}/memory/${ORDER_MEMORY_NAME}`;

    it("appends blocks in skills → project → global → memory order", async () => {
      // Snapshot the dev machine's real global context BEFORE mutating it, so the
      // finally can restore it byte-for-byte. context.md is a persistent,
      // hand-authored file — unlike per-test project context, which the shared
      // beforeEach resetConfig already clears, so it needs no restore here.
      const priorGlobalRes = await fetch(GLOBAL_CONTEXT_URL);
      const priorGlobalContent =
        ((await priorGlobalRes.json()) as { content?: string }).content ?? "";

      try {
        // Localhost writes — a node fetch sends no Origin, so both pass the
        // routes' foreign-origin gate.
        await fetch(GLOBAL_CONTEXT_URL, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "e2e order-probe global context" }),
        });
        const putRes = await fetch(ORDER_MEMORY_URL, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: "e2e order-probe body",
            description: "e2e order probe — safe to delete",
          }),
        });

        expect(putRes.ok).toBe(true);

        // Standard mode injects the memory index; seed project context too so all
        // four blocks are present. (smallModelMode is already false via the shared
        // beforeEach, but set both together for a self-contained arrange step.)
        await setConfig({
          smallModelMode: false,
          projectContext: "e2e order-probe project context",
        });

        const result = await callConnectRaw();
        const iSkills = blockIndex(result, SKILLS_PREFIX);
        const iProject = blockIndex(result, PROJECT_PREFIX);
        const iGlobal = blockIndex(result, GLOBAL_PREFIX);
        const iMemory = blockIndex(result, MEMORY_PREFIX);

        // All four present, in the documented sequence.
        expect(iSkills).toBeGreaterThanOrEqual(0);
        expect(iProject).toBeGreaterThan(iSkills);
        expect(iGlobal).toBeGreaterThan(iProject);
        expect(iMemory).toBeGreaterThan(iGlobal);
      } finally {
        // Restore the dev machine's global context and remove the probe memory so
        // ~/.producer-pal is left untouched. Project context needs no restore —
        // the next test's beforeEach resetConfig clears projectContext.
        await fetch(GLOBAL_CONTEXT_URL, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: priorGlobalContent }),
        });
        await fetch(ORDER_MEMORY_URL, { method: "DELETE" });
      }
    });
  });
});

/**
 * Type for ppal-connect result (matches connect.ts)
 */
interface ConnectResult {
  connected: boolean;
  producerPalVersion: string;
  abletonLiveVersion: string;
  liveSet: {
    name?: string;
    tempo: number;
    timeSignature: string | null;
    sceneCount: number;
    regularTrackCount: number;
    returnTrackCount: number;
    isPlaying?: boolean;
    scale?: string;
    scalePitches?: string;
  };
}
