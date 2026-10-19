// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import {
  copied,
  responseText,
} from "../../offline/tests/offline-add-producer-pal-test-helpers.ts";
import {
  fakeDevice,
  OLD,
  updateCall,
  updateDeps,
} from "./update-test-helpers.ts";

// VERSION's type is its own literal value, hence the cast.
vi.mock(import("#src/shared/config.ts"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, VERSION: "2.5.0-rc2" as typeof actual.VERSION };
});

describe("update-producer-pal between release candidates", () => {
  it("updates an earlier release candidate of the same version", async () => {
    const deps = updateDeps();
    const response = await updateCall(
      fakeDevice("2.5.0-rc1", "2.5.0-rc2"),
      deps,
    );

    expect(response.isError).toBeUndefined();
    expect(responseText(response)).toContain(
      'device:{from:"2.5.0-rc1",to:"2.5.0-rc2"}',
    );
    expect(deps.request).toHaveBeenCalledTimes(1);
  });

  it("refuses a later release candidate as newer than the portal", async () => {
    const deps = updateDeps();
    const response = await updateCall(fakeDevice("2.5.0-rc3"), deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toContain(
      `the running Producer Pal (2.5.0-rc3) is newer than this portal (${VERSION})`,
    );
    expect(deps.installDevice).not.toHaveBeenCalled();
  });

  it("refuses a pre-release it can't order, without saying it's the same version", async () => {
    const deps = updateDeps();
    const response = await updateCall(fakeDevice("2.5.0-beta"), deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toBe(
      `Error: couldn't tell whether the running Producer Pal (2.5.0-beta) is older than this portal (${VERSION}), so nothing was changed. Tell the user to update the Producer Pal device by hand.`,
    );
    expect(deps.installDevice).not.toHaveBeenCalled();
  });
});

describe("update-producer-pal with a library device it can't order", () => {
  it.each([
    [
      "another build of this version",
      VERSION,
      `loaded the device already in the User Library as it is: another build of this portal's version (${VERSION}).`,
    ],
    [
      "a pre-release tag it can't order",
      "2.5.0-beta",
      `loaded the device already in the User Library (2.5.0-beta) as it is. It differs from this portal's (${VERSION}), and which is newer can't be told.`,
    ],
  ])(
    "loads %s without calling the portal older",
    async (_what, previousVersion, note) => {
      const deps = updateDeps({
        installDevice: () =>
          copied("skipped", { previousVersion, bundledVersion: VERSION }),
      });
      const response = await updateCall(fakeDevice(OLD, previousVersion), deps);

      expect(response.isError).toBeUndefined();
      expect(responseText(response)).toContain(`note:"${note}"`);
    },
  );
});
