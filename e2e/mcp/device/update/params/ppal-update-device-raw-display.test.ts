// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for a plug-in param with no readable display range, which is read
 * and written in raw units and reports what it shows as `display`. Uses
 * ValhallaFreqEcho, which answers every label question with its current
 * display and updates that display a moment after a write, so it skips on a
 * machine without it.
 *
 * Needs the remote script, to load the plug-in.
 *
 * Uses: e2e-test-set (adds its own MIDI track)
 *
 * Run with: npm run e2e:mcp -- device/update/params/ppal-update-device-raw-display
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  setupMcpTestContext,
} from "../../../mcp-test-helpers";
import {
  hasVst3,
  hostedPluginHelpers,
} from "../../helpers/hosted-plugin-test-helpers";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../helpers/remote-script-test-helpers";

interface RawParam {
  id: string;
  name: string;
  value?: number;
  min?: number;
  max?: number;
  display?: string;
}

describe.skipIf(!REMOTE_SCRIPT_E2E || !hasVst3("ValhallaFreqEcho.vst3"))(
  "plug-in params with no readable display range",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext();
    const { call } = hostedPluginHelpers(ctx);

    /**
     * Read some of a device's params.
     * @param path - The device
     * @param paramSearch - Which params to read
     * @returns The params
     */
    async function readParams(
      path: string,
      paramSearch: string,
    ): Promise<RawParam[]> {
      const device = await call<{ parameters?: RawParam[] }>(
        "ppal-read-device",
        { path, include: ["param-values"], paramSearch },
      );

      return device.parameters ?? [];
    }

    it("reports the display a raw write lands on", async () => {
      const track = await createMidiTrack(ctx.client!);
      const { path } = await call<{ path: string }>("ppal-create-device", {
        deviceName: "Plug-Ins/VST3/Valhalla DSP/ValhallaFreqEcho",
        path: `t${track}/d+`,
      });

      const [before] = await readParams(path, "wetDry");

      expect(before).toStrictEqual({
        id: expect.any(String),
        name: "wetDry",
        value: 0.5,
        min: 0,
        max: 1,
        display: "50.0 %",
      });

      // Several params at once: every label has caught up when the call returns.
      const written = await call<{ params: RawParam[] }>("ppal-update-device", {
        path,
        params: [
          { name: "wetDry", value: "0.25" },
          { name: "stereo", value: "0" },
        ],
      });

      expect(written.params).toStrictEqual([
        { id: expect.any(String), name: "wetDry", display: "25.0 %" },
        { id: expect.any(String), name: "stereo", display: "mono" },
      ]);

      const [after] = await readParams(path, "wetDry");

      expect(after).toStrictEqual(
        expect.objectContaining({ value: 0.25, display: "25.0 %" }),
      );

      // A value the display can't tell from the last one keeps its label.
      const same = await call<{ params: RawParam[] }>("ppal-update-device", {
        path,
        params: [{ name: "wetDry", value: "0.25001" }],
      });

      // The number isn't the one asked for at the published precision, so it
      // is reported too.
      expect(same.params).toStrictEqual([
        expect.objectContaining({ name: "wetDry", display: "25.0 %" }),
      ]);
    });

    it("reports the display of params set as the device is created", async () => {
      const track = await createMidiTrack(ctx.client!);
      const created = await call<{ params: RawParam[] }>("ppal-create-device", {
        deviceName: "Plug-Ins/VST3/Valhalla DSP/ValhallaFreqEcho",
        path: `t${track}/d+`,
        params: [{ name: "wetDry", value: "0.75" }],
      });

      expect(created.params).toStrictEqual([
        { id: expect.any(String), name: "wetDry", display: "75.0 %" },
      ]);
    });
  },
);
