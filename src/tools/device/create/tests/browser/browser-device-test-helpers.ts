// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { createBrowserDevice } from "../../helpers/browser-devices.ts";

/**
 * Make the mocked `createBrowserDevice` place a device "loaded" at t0/d0. The
 * test file must `vi.mock` `helpers/browser-devices.ts`.
 */
export function mockLoadedBrowserDevice(): void {
  registerMockObject("loaded", { path: livePath.track(0).device(0) });
  vi.mocked(createBrowserDevice).mockImplementation(
    async (_item, _device, _path, options) => {
      const created = {
        device: LiveAPI.from("loaded"),
        entry: { id: "loaded", path: "t0/d0" },
        written: { container: () => null, path: "t0" },
      };

      options?.onPlaced?.(created);

      return created;
    },
  );
}
