// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-manage. Undo and redo step Live's own history through the
 * remote script, so they are opt-in like the other remote script suites:
 * skipped unless E2E_REMOTE_SCRIPT=true, and failed when that's set but the
 * script isn't answering. The install is only driven into its refusals: a real
 * install would overwrite the developer's installed script.
 *
 * Every test opens a fresh Set and only undoes its own track creations.
 *
 * Run with: npm run e2e:mcp:remote-script -- control/ppal-manage
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  parseToolResult,
  resetConfig,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../device/helpers/remote-script-test-helpers.ts";

/** Long enough for the end request, which isn't waited for, to reach Live. */
const END_LANDS_MS = 300;

/** What a step reports about Live's history afterwards. */
interface HistoryResult {
  undone?: number;
  redone?: number;
  canUndo: boolean;
  canRedo: boolean;
  stopped?: string;
}

describe.skipIf(!REMOTE_SCRIPT_E2E)("ppal-manage undo and redo", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext();

  afterEach(resetConfig);

  /**
   * How many tracks the Set holds right now.
   * @returns The track count
   */
  async function trackCount(): Promise<number> {
    const liveSet = parseToolResult<{ tracks?: unknown[] }>(
      await ctx.client!.callTool({
        name: "ppal-read-live-set",
        arguments: { include: ["tracks"] },
      }),
    );

    return liveSet.tracks?.length ?? 0;
  }

  /** One ppal-create-track call, then a wait for its undo step to close. */
  async function createTrack(): Promise<void> {
    await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { path: "t+" },
    });
    await sleep(END_LANDS_MS);
  }

  /**
   * Call ppal-manage.
   * @param action - undo, redo or install-remote-script
   * @param extra - Other params
   * @returns The raw tool result
   */
  function manage(
    action: string,
    extra: Record<string, unknown> = {},
  ): Promise<unknown> {
    return ctx.client!.callTool({
      name: "ppal-manage",
      arguments: { action, ...extra },
    });
  }

  it("undoes the last write call, and reports what Live can do next", async () => {
    const before = await trackCount();

    await createTrack();
    expect(await trackCount()).toBe(before + 1);

    const result = parseToolResult<HistoryResult>(await manage("undo"));

    expect(await trackCount()).toBe(before);
    expect(result.canRedo).toBe(true);
  });

  it("redoes what the undo reverted", async () => {
    const before = await trackCount();

    await createTrack();
    await manage("undo");
    expect(await trackCount()).toBe(before);

    const result = parseToolResult<HistoryResult>(await manage("redo"));

    expect(await trackCount()).toBe(before + 1);
    expect(result.canUndo).toBe(true);
  });

  it("undoes only the last of two write calls", async () => {
    const before = await trackCount();

    await createTrack();
    await createTrack();
    await manage("undo");

    expect(await trackCount()).toBe(before + 1);
  });

  it("undoes several write calls at once with steps", async () => {
    const before = await trackCount();

    await createTrack();
    await createTrack();
    await createTrack();
    expect(await trackCount()).toBe(before + 3);

    const result = parseToolResult<HistoryResult>(
      await manage("undo", { steps: 3 }),
    );

    expect(result.undone).toBe(3);
    expect(await trackCount()).toBe(before);
  });

  it("redoes several steps at once", async () => {
    const before = await trackCount();

    await createTrack();
    await createTrack();
    await manage("undo", { steps: 2 });

    const result = parseToolResult<HistoryResult>(
      await manage("redo", { steps: 2 }),
    );

    expect(result.redone).toBe(2);
    expect(await trackCount()).toBe(before + 2);
  });

  it("refuses more steps than the cap, undoing nothing", async () => {
    await createTrack();

    const before = await trackCount();

    expect(getToolErrorMessage(await manage("undo", { steps: 51 }))).toContain(
      "steps",
    );
    expect(await trackCount()).toBe(before);
  });

  // Undoing a settings change makes Live re-output the device's Port box,
  // which used to stop the server for good (fixed by `change 3350` in
  // tab-setup.maxpat). The server answering afterwards is the proof.
  it("undoes a settings change and the server keeps answering", async () => {
    await setConfig({ notation: "stark" });
    await sleep(END_LANDS_MS);

    const result = parseToolResult<HistoryResult>(await manage("undo"));

    expect(result.undone).toBe(1);

    await sleep(1000);

    expect(await trackCount()).toBeGreaterThan(0);
  });

  it("refuses a redo when there is nothing to redo", async () => {
    await createTrack();

    expect(getToolErrorMessage(await manage("redo"))).toBe(
      "Error: nothing to redo",
    );
  });

  it("refuses undo, pointing at the install, when the remote script is off", async () => {
    await createTrack();
    await setConfig({ remoteScriptEnabled: false });

    const message = getToolErrorMessage(await manage("undo"));

    expect(message).toContain("needs the Producer Pal remote script");
    expect(message).toContain('ppal-manage action "install-remote-script"');
  });

  it("refuses userLibrary on an undo, before touching Live", async () => {
    await createTrack();

    const before = await trackCount();

    expect(
      getToolErrorMessage(await manage("undo", { userLibrary: "/lib" })),
    ).toContain('userLibrary is only for action "install-remote-script"');
    expect(await trackCount()).toBe(before);
  });
});

// The install needs no remote script, so its refusals run in every e2e pass.
describe("ppal-manage install-remote-script and add-producer-pal refusals", () => {
  const ctx = setupMcpTestContext();

  it("refuses a User Library that isn't a folder, installing nothing", async () => {
    const message = getToolErrorMessage(
      await ctx.client!.callTool({
        name: "ppal-manage",
        arguments: {
          action: "install-remote-script",
          userLibrary: "/nonexistent/producer-pal-e2e/User Library",
        },
      }),
    );

    expect(message).toContain("nothing was installed");
    expect(message).toContain("pass it as userLibrary");
  });

  it("refuses a relative User Library path", async () => {
    const message = getToolErrorMessage(
      await ctx.client!.callTool({
        name: "ppal-manage",
        arguments: {
          action: "install-remote-script",
          userLibrary: "Music/User Library",
        },
      }),
    );

    expect(message).toContain("Not an absolute path");
  });

  // The portal answers add-producer-pal; the running device can only refuse.
  it("refuses add-producer-pal, since Producer Pal is running", async () => {
    const message = getToolErrorMessage(
      await ctx.client!.callTool({
        name: "ppal-manage",
        arguments: { action: "add-producer-pal" },
      }),
    );

    expect(message).toContain("Producer Pal is already running");
  });
});

describe("ppal-manage in small-model mode", () => {
  const ctx = setupMcpTestContext();

  afterEach(resetConfig);

  it("is not offered", async () => {
    const names = async (): Promise<string[]> =>
      (await ctx.client!.listTools()).tools.map((tool) => tool.name);

    expect(await names()).toContain("ppal-manage");

    await setConfig({ smallModelMode: true });

    expect(await names()).not.toContain("ppal-manage");
  });
});
