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
    // config.memoryContent is the per-Live-Set project context blob — the field
    // name predates the memory system. It is no longer embedded in the connect
    // JSON; it's injected Node-side as its own "Project context (this Live Set):"
    // block (the same shape as the skills/global/memory blocks).
    const TEST_CONTEXT = "Test project context for e2e testing";
    const PROJECT_CONTEXT_PREFIX = "Project context (this Live Set):";

    it("injects a project context block when content is non-empty", async () => {
      await setConfig({ memoryContent: TEST_CONTEXT });
      const result = await callConnectRaw();

      expect(extractBlock(result, PROJECT_CONTEXT_PREFIX)).toBe(
        `${PROJECT_CONTEXT_PREFIX}\n\n${TEST_CONTEXT}`,
      );
    });

    it("omits the project context block when content is empty", async () => {
      await setConfig({ memoryContent: "" });
      const result = await callConnectRaw();

      expect(extractBlock(result, PROJECT_CONTEXT_PREFIX)).toBe("");
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
