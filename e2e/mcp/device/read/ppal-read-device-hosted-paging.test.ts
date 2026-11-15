// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for paging a hosted plug-in's params with `paramOffset`. Uses
 * Serum 2, which has far more than the 200 params one read lists, so it skips
 * on a machine without it. No built-in Live device has that many.
 *
 * Needs the wrappers installed (`npm run install:plugin-host`) and the remote
 * script.
 *
 * Uses: e2e-test-set (adds its own MIDI track)
 *
 * Run with: npm run e2e:mcp -- device/read/ppal-read-device-hosted-paging
 */
import { describe, expect, it } from "vitest";
import { setupMcpTestContext } from "../../mcp-test-helpers";
import {
  type HostedDevice,
  hasVst3,
  hostedPluginHelpers,
} from "../helpers/hosted-plugin-test-helpers";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../helpers/remote-script-test-helpers";

type PagedDevice = HostedDevice & { paramCount?: number };

describe.skipIf(!REMOTE_SCRIPT_E2E || !hasVst3("Serum2.vst3"))(
  "ppal-read-device paramOffset on a hosted plug-in",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext();
    const { call, hostOnNewTrack } = hostedPluginHelpers(ctx);

    it("pages past the 200 a read lists, and says when it is done", async () => {
      const { path } = await hostOnNewTrack("Serum 2");
      const read = (paramOffset?: number) =>
        call<PagedDevice>("ppal-read-device", {
          path,
          include: ["params"],
          ...(paramOffset != null && { paramOffset }),
        });

      const first = await read();
      const total = first.paramCount!;

      expect(first.parameters).toHaveLength(200);
      expect(total).toBeGreaterThan(200);
      expect(first.detail).toBe(
        `listing params 1-200 of ${total}; pass paramOffset: 200 for more, or narrow with paramSearch`,
      );

      const second = await read(200);
      const firstIds = new Set(first.parameters!.map((p) => p.id));

      expect(second.paramCount).toBe(total);
      expect(second.parameters!.length).toBeGreaterThan(0);
      expect(second.parameters!.some((p) => firstIds.has(p.id))).toBe(false);

      const past = await read(total);

      expect(past.parameters).toStrictEqual([]);
      expect(past.paramCount).toBe(total);
      expect(past.detail).toBe(
        `paramOffset ${total} is past the last param (${total})`,
      );
    });

    it("counts the offset within a paramSearch's matches", async () => {
      const { path } = await hostOnNewTrack("Serum 2");
      const all = await call<PagedDevice>("ppal-read-device", {
        path,
        paramSearch: "a",
        paramOffset: 1,
      });
      const matches = all.paramCount!;

      expect(matches).toBeGreaterThan(1);
      expect(all.parameters!.length).toBe(Math.min(200, matches - 1));
    });
  },
);
