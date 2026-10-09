// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for POST /config `remoteScriptMinVersion`, the dev switch that makes
 * a running remote script look older than this server needs. Opt-in like the
 * other remote script suites: skipped unless E2E_REMOTE_SCRIPT=true, and failed
 * when that's set but the script isn't answering.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- control/ppal-remote-script-min-version
 */
import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";
import {
  parseToolResult,
  type ReadClipResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import { createClipInSlot } from "../clip/helpers/ppal-clip-transforms-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../device/helpers/remote-script-test-helpers.ts";

/** Newer than any release, so the running script is always older. */
const TOO_NEW = "99.0.0";

/** A Skills section that ships only while a current remote script answers. */
const AUTOMATION_HEADING = "## Clip Automation";

describe.skipIf(!REMOTE_SCRIPT_E2E)(
  "remoteScriptMinVersion config switch",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext();

    afterEach(async () => {
      await setConfig({ remoteScriptMinVersion: null });
    });

    it("makes a clip envelope read say the remote script is out of date", async () => {
      const id = await createClipInSlot(
        ctx,
        `t${String(EMPTY_MIDI_TRACK)}/s0`,
        { notes: "C3 1|1", length: "1bar" },
      );

      /**
       * Read the clip's envelopes.
       * @returns The result's `envelopes`
       */
      async function readEnvelopes(): Promise<ReadClipResult["envelopes"]> {
        return parseToolResult<ReadClipResult>(
          await ctx.client!.callTool({
            name: "ppal-read-clip",
            arguments: { id, include: ["envelopes"] },
          }),
        ).envelopes;
      }

      // The clip has no automation, so a working read is a list, not a reason.
      const before = await readEnvelopes();

      expect(typeof before).not.toBe("string");

      await setConfig({ remoteScriptMinVersion: TOO_NEW });
      await sleep(50);

      expect(await readEnvelopes()).toStrictEqual(
        expect.stringMatching(
          new RegExp(
            `remote script is out of date \\(running \\d.*needs ${TOO_NEW} or later\\).*restart Live`,
          ),
        ),
      );

      // Restored: the same read gives what it did at first.
      await setConfig({ remoteScriptMinVersion: null });
      await sleep(50);

      expect(await readEnvelopes()).toStrictEqual(before);
    });

    it("drops the remote-script skills while the script looks out of date", async () => {
      await setConfig({ smallModelMode: false });
      expect(await connectSkills()).toContain(AUTOMATION_HEADING);

      await setConfig({ remoteScriptMinVersion: TOO_NEW });
      expect(await connectSkills()).not.toContain(AUTOMATION_HEADING);

      await setConfig({ remoteScriptMinVersion: null });
      expect(await connectSkills()).toContain(AUTOMATION_HEADING);
    });

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
  },
);
