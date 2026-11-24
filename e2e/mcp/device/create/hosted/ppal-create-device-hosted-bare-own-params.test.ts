// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for clip envelopes on a plug-in host wrapper's own params when it
 * has no plug-in loaded. A name the plug-in can't own ("Device On") falls to
 * the wrapper's own Live params.
 * Needs no plug-in, only the wrappers installed (`npm run install:plugin-host`)
 * and the remote script.
 *
 * Uses: e2e-test-set (adds its own MIDI track)
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/device/create/hosted/ppal-create-device-hosted-bare-own-params.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  type ClipEnvelopeResult,
  createMidiTrack,
  createTestDeviceAt,
  setupMcpTestContext,
} from "../../../mcp-test-helpers";
import {
  type HostedDevice,
  hostedPluginHelpers,
} from "../../helpers/hosted-plugin-test-helpers";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../helpers/remote-script-test-helpers";

describe.skipIf(!REMOTE_SCRIPT_E2E)(
  "bare plug-in host wrapper's own params in clip envelopes",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext();
    const { call } = hostedPluginHelpers(ctx);

    it("writes an envelope for Device On by name", async () => {
      const track = await createMidiTrack(ctx.client!);
      const path = await createTestDeviceAt(
        ctx.client!,
        "PPal Plug-in Instrument",
        `t${track}`,
      );

      // The wrapper answers a moment after it loads.
      await expect
        .poll(
          async () =>
            (await call<HostedDevice>("ppal-read-device", { path })).detail,
          { timeout: 10_000 },
        )
        .toBe("no plug-in loaded");

      const clip = await call<{ id: string }>("ppal-create-clip", {
        path: `t${track}/s0`,
        notes: "C3 1|1",
        length: "1bar",
      });

      const write = async (): Promise<{ envelopes: number }> =>
        await call<{ envelopes: number }>("ppal-update-clip", {
          id: clip.id,
          envelopes: `${path}/Device On: 1|1 1`,
        });

      // Until the wrapper's slots answer, the line says it is still loading.
      await expect
        .poll(async () => (await write()).envelopes, { timeout: 10_000 })
        .toBe(1);

      const read = await call<{ envelopes?: ClipEnvelopeResult[] }>(
        "ppal-read-clip",
        { id: clip.id, include: ["envelopes"] },
      );

      expect(read.envelopes).toStrictEqual([
        expect.objectContaining({ parameter: "Device On", device: path }),
      ]);
    }, 60_000);
  },
);
