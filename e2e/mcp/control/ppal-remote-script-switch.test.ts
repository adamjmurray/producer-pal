// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for POST /config `remoteScriptEnabled`, the dev switch that makes a
 * running remote script look uninstalled. Opt-in like the other remote script
 * suites: skipped unless E2E_REMOTE_SCRIPT=true, and failed when that's set but
 * the script isn't answering, since with no script there is nothing to switch off.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- control/ppal-remote-script-switch
 */
import { describe, expect, it } from "vitest";
import { EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";
import {
  parseToolResult,
  type ReadClipResult,
  resetConfig,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import { createClipInSlot } from "../clip/helpers/ppal-clip-transforms-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../device/helpers/remote-script-test-helpers.ts";

/** Skills sections that ship only while the remote script answers. */
const AUTOMATION_HEADING = "## Clip Automation";
const PLUGINS_HEADING = "### Plug-Ins, Max for Live Devices & Presets";

describe.skipIf(!REMOTE_SCRIPT_E2E)("remoteScriptEnabled config switch", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext();

  /**
   * The Producer Pal Skills block ppal-connect injects.
   * @returns Its text, or "" when there is none
   */
  async function connectSkills(): Promise<string> {
    const result = (await ctx.client!.callTool({
      name: "ppal-connect",
      arguments: {},
    })) as { content?: Array<{ text?: string }> };

    return (
      result.content?.find((block) =>
        block.text?.startsWith("# Producer Pal Skills"),
      )?.text ?? ""
    );
  }

  it("drops the remote-script skills while off, and brings them back on", async () => {
    await setConfig({ smallModelMode: false });

    const on = await connectSkills();

    expect(on).toContain(AUTOMATION_HEADING);
    expect(on).toContain(PLUGINS_HEADING);

    await setConfig({ remoteScriptEnabled: false });

    const off = await connectSkills();

    expect(off).not.toContain(AUTOMATION_HEADING);
    expect(off).not.toContain(PLUGINS_HEADING);

    await setConfig({ remoteScriptEnabled: true });
    expect(await connectSkills()).toContain(AUTOMATION_HEADING);
  });

  it("makes a clip envelope read say the remote script isn't running", async () => {
    const id = await createClipInSlot(ctx, `t${String(EMPTY_MIDI_TRACK)}/s0`, {
      notes: "C3 1|1",
      length: "1bar",
    });

    await setConfig({ remoteScriptEnabled: false });
    await sleep(50);

    const { envelopes } = parseToolResult<ReadClipResult>(
      await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { id, include: ["envelopes"] },
      }),
    );

    expect(envelopes).toStrictEqual(
      expect.stringContaining("remote script isn't running"),
    );
  });

  it("is switched back on by resetConfig", async () => {
    await setConfig({ remoteScriptEnabled: false });
    expect(await connectSkills()).not.toContain(AUTOMATION_HEADING);

    await resetConfig();
    expect(await connectSkills()).toContain(AUTOMATION_HEADING);
  });
});
