// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-update-device copyParamsFrom between plug-in host wrappers.
 * Needs no plug-in, only the wrappers installed (`npm run install:plugin-host`)
 * and the remote script.
 *
 * Uses: e2e-test-set (adds its own MIDI track)
 *
 * Run with: npm run e2e:mcp -- device/create/hosted/ppal-update-device-copy-params-hosted
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDeviceAt,
  getToolErrorMessage,
  isToolError,
  setupMcpTestContext,
} from "../../../mcp-test-helpers.ts";
import {
  type HostedDevice,
  hostedPluginHelpers,
} from "../../helpers/hosted-plugin-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../helpers/remote-script-test-helpers.ts";

const NO_PLUGIN = "no plug-in loaded";

describe.skipIf(!REMOTE_SCRIPT_E2E)(
  "ppal-update-device copyParamsFrom between plug-in hosts",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext();
    const { call } = hostedPluginHelpers(ctx);

    it("refuses two hosts that have no plug-in loaded", async () => {
      const track = await createMidiTrack(ctx.client!);
      const paths = [
        await createTestDeviceAt(
          ctx.client!,
          "PPal Plug-in Effect",
          `t${track}`,
        ),
        await createTestDeviceAt(
          ctx.client!,
          "PPal Plug-in Effect",
          `t${track}`,
        ),
      ];

      // A wrapper answers a moment after it loads, and one that hasn't is
      // refused for that instead.
      for (const path of paths) {
        await expect
          .poll(
            async () =>
              (await call<HostedDevice>("ppal-read-device", { path })).detail,
            { timeout: 10_000 },
          )
          .toBe(NO_PLUGIN);
      }

      const result = await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: { path: paths[1], copyParamsFrom: paths[0] },
      });

      expect(isToolError(result)).toBe(true);
      expect(getToolErrorMessage(result)).toContain(
        "not copied: neither plug-in host has a plug-in loaded",
      );
    });
  },
);
