// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for what a remote script refusal tells the caller to do. A caller
 * with ppal-manage is pointed at it; a small-model caller never has the tool,
 * so it is sent to the chat UI instead. Covers a missing script
 * (`remoteScriptEnabled`) and an out-of-date one (`remoteScriptMinVersion`).
 * Opt-in like the other remote script suites: skipped unless
 * E2E_REMOTE_SCRIPT=true, and failed when that's set but the script isn't
 * answering.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track.
 * See: e2e/live-sets/specs/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- device/create/ppal-create-device-manage-wording
 */
import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import {
  getToolErrorMessage,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../helpers/remote-script-test-helpers.ts";

/** Newer than any release, so the running script is always older. */
const TOO_NEW = "99.0.0";

/** Where a caller without ppal-manage is sent. */
const CHAT_UI = "Settings → Installation";

describe.skipIf(!REMOTE_SCRIPT_E2E)(
  "remote script refusals and ppal-manage",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext();

    afterEach(async () => {
      await setConfig({ remoteScriptMinVersion: null });
    });

    /**
     * Ask for a plug-in, which only loads through the remote script. The name
     * needn't exist: the refusal comes before the lookup finds anything.
     * @returns The refusal's text
     */
    async function refusedPlugIn(): Promise<string> {
      await sleep(50);

      return getToolErrorMessage(
        await ctx.client!.callTool({
          name: "ppal-create-device",
          arguments: {
            device: "Some Plug-In",
            path: `t${String(EMPTY_MIDI_TRACK)}`,
          },
        }),
      );
    }

    it("names ppal-manage when the script is missing and the caller has it", async () => {
      await setConfig({ smallModelMode: false, remoteScriptEnabled: false });

      const text = await refusedPlugIn();

      expect(text).toContain("ppal-manage");
      expect(text).toContain(CHAT_UI);
    });

    it("leaves ppal-manage out when the script is missing and the caller is a small model", async () => {
      await setConfig({ smallModelMode: true, remoteScriptEnabled: false });

      const text = await refusedPlugIn();

      expect(text).not.toContain("ppal-manage");
      expect(text).toContain(CHAT_UI);
    });

    it("names ppal-manage when the script is out of date and the caller has it", async () => {
      await setConfig({
        smallModelMode: false,
        remoteScriptMinVersion: TOO_NEW,
      });

      const text = await refusedPlugIn();

      expect(text).toContain("out of date");
      expect(text).toContain("ppal-manage");
    });

    it("leaves ppal-manage out when the script is out of date and the caller is a small model", async () => {
      await setConfig({
        smallModelMode: true,
        remoteScriptMinVersion: TOO_NEW,
      });

      const text = await refusedPlugIn();

      expect(text).toContain("out of date");
      expect(text).not.toContain("ppal-manage");
      expect(text).toContain(CHAT_UI);
    });
  },
);
