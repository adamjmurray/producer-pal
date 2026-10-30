// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-manage. Undo and redo step Live's own history through the
 * remote script, so they are opt-in like the other remote script suites:
 * skipped unless E2E_REMOTE_SCRIPT=true, and failed when that's set but the
 * script isn't answering. The install only ever targets a scratch User Library
 * or is driven into its refusals: a real install would overwrite the
 * developer's installed script and device.
 *
 * Every test opens a fresh Set and only undoes its own track creations.
 *
 * Run with: npm run e2e:mcp:remote-script -- control/ppal-manage
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  type McpTestContext,
  parseToolResult,
  resetConfig,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import {
  appendTracksInOneCall,
  END_LANDS_MS,
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../device/helpers/remote-script-test-helpers.ts";
import { readTrackCount } from "../device/helpers/track-count-test-helpers.ts";

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

  const trackCount = (): Promise<number> => readTrackCount(ctx.client!);

  /** One ppal-create-track call, then a wait for its undo step to close. */
  const createTrack = (): Promise<void> =>
    appendTracksInOneCall(ctx.client!, 1);

  const manage = (
    action: string,
    extra: Record<string, unknown> = {},
  ): Promise<unknown> => manageWith(ctx, action, extra);

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

  // A context read changes nothing in the Set, so it closes no undo step and
  // leaves the history between the undo and the redo alone.
  it("redoes after a ppal-context read in between", async () => {
    const before = await trackCount();

    await createTrack();
    await manage("undo");
    await ctx.client!.callTool({
      name: "ppal-context",
      arguments: { action: "read" },
    });
    await sleep(END_LANDS_MS);

    const result = parseToolResult<HistoryResult>(await manage("redo"));

    expect(result.redone).toBe(1);
    expect(await trackCount()).toBe(before + 1);
  });

  // Calls that change nothing close no undo step. A clip action never touches
  // the Set, and a live-api get is a read.
  const NO_CHANGE_CALLS: Array<[string, Record<string, unknown>]> = [
    ["ppal-playback", { action: "stop-all-session-clips" }],
    [
      "ppal-live-api",
      { path: "live_set", operations: [{ type: "get", property: "tempo" }] },
    ],
  ];

  /** Make each of the calls that change nothing, then wait for any end. */
  async function changeNothing(): Promise<void> {
    await setConfig({ liveApiEnabled: true });
    await sleep(50);

    for (const [name, args] of NO_CHANGE_CALLS) {
      await ctx.client!.callTool({ name, arguments: args });
    }

    await sleep(END_LANDS_MS);
  }

  // So they leave the history between the undo and the redo alone.
  it("redoes after calls that change nothing in between", async () => {
    const before = await trackCount();

    await createTrack();
    await manage("undo");
    await changeNothing();

    const result = parseToolResult<HistoryResult>(await manage("redo"));

    expect(result.redone).toBe(1);
    expect(await trackCount()).toBe(before + 1);
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
    expect(message).toContain('ppal-manage action "install-producer-pal"');
  });

  it("refuses userLibrary on an undo, before touching Live", async () => {
    await createTrack();

    const before = await trackCount();

    expect(
      getToolErrorMessage(await manage("undo", { userLibrary: "/lib" })),
    ).toContain('userLibrary is only for action "install-producer-pal"');
    expect(await trackCount()).toBe(before);
  });
});

/**
 * Call ppal-manage on a running test context.
 * @param ctx - The test context
 * @param action - The ppal-manage action
 * @param extra - Other params
 * @returns The raw tool result
 */
function manageWith(
  ctx: McpTestContext,
  action: string,
  extra: Record<string, unknown> = {},
): Promise<unknown> {
  return ctx.client!.callTool({
    name: "ppal-manage",
    arguments: { action, ...extra },
  });
}

/** What one file of an install reports. */
interface InstallPartResult {
  ok?: false;
  status?: string;
  path?: string;
  detail?: string;
}

/** What install-producer-pal reports. */
interface InstallResult {
  remoteScript: InstallPartResult;
  device: InstallPartResult;
  pluginHost?: (InstallPartResult & { name: string })[];
  nextSteps: string;
}

// Whether the build under test hosts plug-ins: set it as for the hosted
// create-device e2e, with the same flag on the build.
const HOSTING_BUILD = process.env.ENABLE_HOSTED_PLUGINS === "true";

// The install needs no remote script, so these run in every e2e pass.
describe("ppal-manage install-producer-pal and add-producer-pal", () => {
  const ctx = setupMcpTestContext();
  const scratch: string[] = [];

  afterEach(() => {
    for (const dir of scratch.splice(0)) {
      rmSync(dir, { recursive: true });
    }
  });

  /** @returns A User Library folder that is gone after the test */
  function scratchLibrary(): string {
    const dir = mkdtempSync(join(tmpdir(), "ppal-manage-e2e-"));

    scratch.push(dir);

    return dir;
  }

  it.each(["install-producer-pal", "install-remote-script"])(
    "%s installs the remote script into a User Library and reports the device too",
    async (action) => {
      const userLibrary = scratchLibrary();
      const result = parseToolResult<InstallResult>(
        await manageWith(ctx, action, { userLibrary }),
      );

      expect(result.remoteScript.status).toBe("installed");
      expect(existsSync(join(result.remoteScript.path!, "__init__.py"))).toBe(
        true,
      );
      expect(result.remoteScript.path!.startsWith(userLibrary)).toBe(true);

      // A development device can't be copied, so the debug build reports it as
      // failed beside the installed script; a frozen one is installed. Either
      // way each file reports for itself and the next steps match.
      if (result.device.ok === false) {
        expect(result.device.detail).toBeTruthy();
        expect(result.nextSteps).toContain(
          "Only the remote script was installed; the device was not (see device).",
        );
        expect(existsSync(join(userLibrary, "Presets/MIDI Effects"))).toBe(
          false,
        );
      } else {
        expect(result.device.status).toBe("installed");
        expect(existsSync(result.device.path!)).toBe(true);
        expect(result.nextSteps).toContain("restart Live");
      }
    },
  );

  it.skipIf(!HOSTING_BUILD)(
    "installs both plug-in host wrappers into the User Library, and leaves them alone when current",
    async () => {
      const userLibrary = scratchLibrary();
      const first = parseToolResult<InstallResult>(
        await manageWith(ctx, "install-producer-pal", { userLibrary }),
      );

      expect(first.pluginHost?.map((part) => part.name)).toStrictEqual([
        "PPal Plug-in Effect",
        "PPal Plug-in Instrument",
      ]);
      expect(first.pluginHost?.map((part) => part.status)).toStrictEqual([
        "installed",
        "installed",
      ]);
      expect(
        existsSync(
          join(
            userLibrary,
            "Presets/Audio Effects/Max Audio Effect/PPal Plug-in Effect.amxd",
          ),
        ),
      ).toBe(true);
      expect(
        existsSync(
          join(
            userLibrary,
            "Presets/Instruments/Max Instrument/PPal Plug-in Instrument.amxd",
          ),
        ),
      ).toBe(true);

      const second = parseToolResult<InstallResult>(
        await manageWith(ctx, "install-producer-pal", { userLibrary }),
      );

      expect(second.pluginHost?.map((part) => part.status)).toStrictEqual([
        "current",
        "current",
      ]);
    },
  );

  it.skipIf(HOSTING_BUILD)(
    "installs no plug-in host wrappers in a build that doesn't host plug-ins",
    async () => {
      const userLibrary = scratchLibrary();
      const result = parseToolResult<InstallResult>(
        await manageWith(ctx, "install-producer-pal", { userLibrary }),
      );

      expect(result).not.toHaveProperty("pluginHost");
      expect(
        existsSync(join(userLibrary, "Presets/Audio Effects/Max Audio Effect")),
      ).toBe(false);
    },
  );

  it("refuses a User Library that isn't a folder, installing nothing", async () => {
    const message = getToolErrorMessage(
      await manageWith(ctx, "install-producer-pal", {
        userLibrary: "/nonexistent/producer-pal-e2e/User Library",
      }),
    );

    expect(message).toContain("nothing was installed");
    expect(message).toContain("pass it as userLibrary");
  });

  it("refuses a User Library that isn't a folder under the retired name too", async () => {
    const message = getToolErrorMessage(
      await manageWith(ctx, "install-remote-script", {
        userLibrary: "/nonexistent/producer-pal-e2e/User Library",
      }),
    );

    expect(message).toContain("nothing was installed");
  });

  it("refuses a relative User Library path", async () => {
    const message = getToolErrorMessage(
      await manageWith(ctx, "install-producer-pal", {
        userLibrary: "Music/User Library",
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

  // Same for update-producer-pal: the device it replaces can't answer it.
  it("sends update-producer-pal to the portal", async () => {
    const message = getToolErrorMessage(
      await ctx.client!.callTool({
        name: "ppal-manage",
        arguments: { action: "update-producer-pal" },
      }),
    );

    expect(message).toContain("runs through the portal");
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
