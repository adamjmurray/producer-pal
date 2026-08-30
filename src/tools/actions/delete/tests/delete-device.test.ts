// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import {
  setupDeviceMocks,
  setupNestedDrumDeviceMocks,
} from "./delete-test-helpers.ts";
import { deleteObject } from "../delete.ts";

describe("deleteObject device deletion", () => {
  // delete confirms the object is gone, so the mock has to model it going away
  beforeEach(simulateMockDeletes);

  function expectDeviceDeleted(
    id: string,
    path: string,
    parentPath: string,
    deviceIndex: number,
  ): void {
    const { parents } = setupDeviceMocks(id, path);

    const result = deleteObject({ id: id, type: "device" });

    expect(result).toStrictEqual({ id, type: "device", deleted: true });
    expect(parents.get(parentPath)?.call).toHaveBeenCalledWith(
      "delete_device",
      deviceIndex,
    );
  }

  it("should delete a device from a regular track", () => {
    expectDeviceDeleted(
      "device_1",
      String(livePath.track(0).device(1)),
      String(livePath.track(0)),
      1,
    );
  });

  it("should delete a device from a return track", () => {
    expectDeviceDeleted(
      "device_2",
      String(livePath.returnTrack(0).device(1)),
      String(livePath.returnTrack(0)),
      1,
    );
  });

  it("should delete a device from the master track", () => {
    expectDeviceDeleted(
      "device_3",
      String(livePath.masterTrack().device(0)),
      String(livePath.masterTrack()),
      0,
    );
  });

  it("should delete a device at a multi-digit index", () => {
    // A `\d`-only device-index regex would read "12" as "1" and delete the
    // wrong device.
    expectDeviceDeleted(
      "device_12",
      String(livePath.track(0).device(12)),
      String(livePath.track(0)),
      12,
    );
  });

  it("should delete multiple devices", () => {
    const ids = "device_1,device_2";

    const { parents } = setupDeviceMocks(["device_1", "device_2"], {
      device_1: String(livePath.track(0).device(0)),
      device_2: String(livePath.track(1).device(1)),
    });

    const result = deleteObject({ ids, type: "device" });

    // Results come back in deletion order (highest track index first), matching
    // how track/scene deletes already report their results.
    expect(result).toStrictEqual([
      { id: "device_2", type: "device", deleted: true },
      { id: "device_1", type: "device", deleted: true },
    ]);
    expect(parents.get(String(livePath.track(0)))?.call).toHaveBeenCalledWith(
      "delete_device",
      0,
    );
    expect(parents.get(String(livePath.track(1)))?.call).toHaveBeenCalledWith(
      "delete_device",
      1,
    );
  });

  it("should delete sibling devices on the same parent highest-index-first", () => {
    // Regression: delete_device is positional, so removing index 0 first shifts
    // index 1 down to 0 — the second delete would then hit the wrong device.
    const { parents } = setupDeviceMocks(["device_0_0", "device_0_1"], {
      device_0_0: String(livePath.track(0).device(0)),
      device_0_1: String(livePath.track(0).device(1)),
    });

    const result = deleteObject({
      id: "device_0_0,device_0_1",
      type: "device",
    });

    const parent = parents.get(String(livePath.track(0)));

    expect(parent?.call).toHaveBeenNthCalledWith(1, "delete_device", 1);
    expect(parent?.call).toHaveBeenNthCalledWith(2, "delete_device", 0);

    expect(result).toStrictEqual([
      { id: "device_0_1", type: "device", deleted: true },
      { id: "device_0_0", type: "device", deleted: true },
    ]);
  });

  it("should order multi-digit sibling device indices highest-first", () => {
    // parsePathSegments must read the FULL index: a `\d`-only match reads
    // "devices 13" as index 1, sorting it below index 2 and flipping the
    // positional delete order (which would then shift the survivor down).
    const { parents } = setupDeviceMocks(["d2", "d13"], {
      d2: String(livePath.track(0).device(2)),
      d13: String(livePath.track(0).device(13)),
    });

    deleteObject({ id: "d2,d13", type: "device" });

    const parent = parents.get(String(livePath.track(0)));

    expect(parent?.call).toHaveBeenNthCalledWith(1, "delete_device", 13);
    expect(parent?.call).toHaveBeenNthCalledWith(2, "delete_device", 2);
  });

  it("should delete a device referenced by a duplicate id only once", () => {
    const { parents } = setupDeviceMocks(
      "dupe_device",
      String(livePath.track(0).device(1)),
    );

    const result = deleteObject({
      id: "dupe_device, dupe_device",
      type: "device",
    });

    const parent = parents.get(String(livePath.track(0)));

    // De-duped to one delete; a second positional delete would remove the
    // neighbor that shifted down into index 1.
    expect(parent?.call).toHaveBeenCalledTimes(1);
    expect(parent?.call).toHaveBeenCalledWith("delete_device", 1);
    expect(result).toStrictEqual({
      id: "dupe_device",
      type: "device",
      deleted: true,
    });
  });

  it("should skip a malformed device path while still deleting valid ones", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { parents } = setupDeviceMocks(["good_device", "bad_device"], {
      good_device: String(livePath.track(0).device(0)),
      bad_device: "invalid_path_without_devices",
    });

    const result = deleteObject({
      id: "good_device,bad_device",
      type: "device",
    });

    expect(result).toStrictEqual(
      expect.arrayContaining([
        { id: "good_device", type: "device", deleted: true },
        { id: "bad_device", type: "device", deleted: false },
      ]),
    );
    expect(result).toHaveLength(2);
    expect(parents.get(String(livePath.track(0)))?.call).toHaveBeenCalledWith(
      "delete_device",
      0,
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'could not find device index in path "invalid_path_without_devices"',
      ),
    );
    warnSpy.mockRestore();
  });

  it("should warn and skip when device path is malformed", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const id = "device_0";

    setupDeviceMocks(id, "invalid_path_without_devices");

    const result = deleteObject({ id: id, type: "device" });

    expect(result).toStrictEqual({
      id,
      type: "device",
      deleted: false,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'could not find device index in path "invalid_path_without_devices"',
      ),
    );
    warnSpy.mockRestore();
  });

  describe("nested device deletion", () => {
    it("should delete a device nested in a chain", () => {
      expectDeviceDeleted(
        "nested_device",
        "live_set tracks 1 devices 0 chains 2 devices 1",
        "live_set tracks 1 devices 0 chains 2",
        1,
      );
    });

    it("should delete a device nested in a return chain", () => {
      expectDeviceDeleted(
        "return_chain_device",
        "live_set tracks 0 devices 0 return_chains 1 devices 0",
        "live_set tracks 0 devices 0 return_chains 1",
        0,
      );
    });

    it("should delete a deeply nested device", () => {
      expectDeviceDeleted(
        "deep_device",
        "live_set tracks 0 devices 0 chains 0 devices 1 chains 0 devices 2",
        "live_set tracks 0 devices 0 chains 0 devices 1 chains 0",
        2,
      );
    });

    it("should delete same-chain siblings highest-index-first when a sibling-chain device interposes", () => {
      // Regression: two devices in chains 0 must delete index 1 before index 0
      // (positional delete_device shifts the survivor down otherwise). A device
      // in chains 1 has an equal-length parent path; the old length-based
      // comparator treated it as sort-equal to both siblings, so with this input
      // order it interposed and flipped the siblings into ascending order —
      // deleting chains-0 index 0 first, shifting index 1 down, then no-op'ing
      // the second delete. Order the ids so a buggy comparator misorders them.
      const rack = String(livePath.track(2).device(0));
      const { parents } = setupDeviceMocks(["c0_d0", "c1_d0", "c0_d1"], {
        c0_d0: `${rack} chains 0 devices 0`,
        c1_d0: `${rack} chains 1 devices 0`,
        c0_d1: `${rack} chains 0 devices 1`,
      });

      const result = deleteObject({
        id: "c0_d0, c1_d0, c0_d1",
        type: "device",
      });

      // chains 0: index 1 must be deleted before index 0.
      const chain0 = parents.get(`${rack} chains 0`);

      expect(chain0?.call).toHaveBeenNthCalledWith(1, "delete_device", 1);
      expect(chain0?.call).toHaveBeenNthCalledWith(2, "delete_device", 0);

      // chains 1: its lone device is deleted once, unaffected by chains 0.
      const chain1 = parents.get(`${rack} chains 1`);

      expect(chain1?.call).toHaveBeenCalledTimes(1);
      expect(chain1?.call).toHaveBeenCalledWith("delete_device", 0);

      // All three deleted (result order is deletion order, asserted above via
      // call order; here we only care that every target succeeded).
      expect(result).toStrictEqual(
        expect.arrayContaining([
          { id: "c0_d0", type: "device", deleted: true },
          { id: "c1_d0", type: "device", deleted: true },
          { id: "c0_d1", type: "device", deleted: true },
        ]),
      );
      expect(result).toHaveLength(3);
    });

    it("orders cross-collection siblings (chains before return_chains) deterministically", () => {
      // When two device paths diverge at a sub-collection name (chains vs
      // return_chains under the same device) the deletes are independent, so the
      // order is correctness-irrelevant — but the comparator still returns a
      // DETERMINISTIC order (a stable name compare: "chains" < "return_chains" →
      // chains first) to keep the sort transitive. Pin that order's sign in BOTH
      // input orders: forward exercises the natural compare, reversed proves the
      // tiebreaker (not input order) decides — which a blanked/flipped comparator
      // would get wrong.
      const rack = String(livePath.track(0).device(0));

      function deleteAndMeasure(
        ids: string,
        chId: string,
        rcId: string,
      ): { result: unknown; chainOrder: number; returnChainOrder: number } {
        const { parents } = setupDeviceMocks([chId, rcId], {
          [chId]: `${rack} chains 0 devices 0`,
          [rcId]: `${rack} return_chains 0 devices 0`,
        });

        const result = deleteObject({ ids, type: "device" });
        const chainOrder =
          parents.get(`${rack} chains 0`)?.call.mock.invocationCallOrder[0] ??
          0;
        const returnChainOrder =
          parents.get(`${rack} return_chains 0`)?.call.mock
            .invocationCallOrder[0] ?? 0;

        return { result, chainOrder, returnChainOrder };
      }

      const forward = deleteAndMeasure("ch, rc", "ch", "rc");
      const reversed = deleteAndMeasure("rc2, ch2", "ch2", "rc2");

      for (const { result, chainOrder, returnChainOrder } of [
        forward,
        reversed,
      ]) {
        // chains deletes before return_chains regardless of input order.
        expect(chainOrder).toBeLessThan(returnChainOrder);
        expect(result).toHaveLength(2);
        expect(result).toStrictEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: "device", deleted: true }),
            expect.objectContaining({ type: "device", deleted: true }),
          ]),
        );
      }
    });

    it("should delete a nested device before the rack that contains it", () => {
      // Descendant-before-ancestor: deleting the rack first would invalidate the
      // nested device's parent path. The nested device must delete first.
      const { devices, parents } = setupDeviceMocks(["rack", "nested"], {
        rack: String(livePath.track(0).device(0)),
        nested: "live_set tracks 0 devices 0 chains 0 devices 1",
      });

      deleteObject({ id: "rack, nested", type: "device" });

      const nestedParent = parents.get("live_set tracks 0 devices 0 chains 0");
      const trackParent = parents.get(String(livePath.track(0)));

      // Nested device (via its chain) deletes before the rack (via the track).
      const nestedOrder = nestedParent?.call.mock.invocationCallOrder[0] ?? 0;
      const rackOrder = trackParent?.call.mock.invocationCallOrder[0] ?? 0;

      expect(nestedOrder).toBeLessThan(rackOrder);
      expect(nestedParent?.call).toHaveBeenCalledWith("delete_device", 1);
      expect(trackParent?.call).toHaveBeenCalledWith("delete_device", 0);
      expect(devices.size).toBe(2);
    });
  });

  describe("path-based deletion", () => {
    it("should delete a device by path", () => {
      const { parents } = setupDeviceMocks(
        "device_by_path",
        String(livePath.track(0).device(1)),
      );

      const result = deleteObject({ path: "t0/d1", type: "device" });

      expect(result).toStrictEqual({
        id: "device_by_path",
        type: "device",
        deleted: true,
      });
      expect(parents.get(String(livePath.track(0)))?.call).toHaveBeenCalledWith(
        "delete_device",
        1,
      );
    });

    it("should delete multiple devices by path", () => {
      setupDeviceMocks(["dev_0_0", "dev_1_1"], {
        dev_0_0: String(livePath.track(0).device(0)),
        dev_1_1: String(livePath.track(1).device(1)),
      });

      const result = deleteObject({ path: "t0/d0, t1/d1", type: "device" });

      // Deletion order: highest track index first.
      expect(result).toStrictEqual([
        { id: "dev_1_1", type: "device", deleted: true },
        { id: "dev_0_0", type: "device", deleted: true },
      ]);
    });

    it("should delete devices from both ids and path", () => {
      setupDeviceMocks(["dev_by_id", "dev_by_path"], {
        dev_by_id: String(livePath.track(1).device(1)),
        dev_by_path: String(livePath.track(0).device(0)),
      });

      const result = deleteObject({
        id: "dev_by_id",
        path: "t0/d0",
        type: "device",
      });

      expect(result).toStrictEqual([
        { id: "dev_by_id", type: "device", deleted: true },
        { id: "dev_by_path", type: "device", deleted: true },
      ]);
    });

    it("should delete nested device by path", () => {
      const { parents } = setupDeviceMocks(
        "nested_dev",
        "live_set tracks 1 devices 0 chains 2 devices 1",
      );

      const result = deleteObject({ path: "t1/d0/c2/d1", type: "device" });

      expect(result).toStrictEqual({
        id: "nested_dev",
        type: "device",
        deleted: true,
      });
      expect(
        parents.get("live_set tracks 1 devices 0 chains 2")?.call,
      ).toHaveBeenCalledWith("delete_device", 1);
    });

    it("should skip invalid paths and continue with valid ones", () => {
      mockNonExistentObjects();
      setupDeviceMocks("valid_dev", String(livePath.track(0).device(0)));

      const result = deleteObject({ path: "t0/d0, t99/d99", type: "device" });

      expect(result).toStrictEqual([
        { id: "valid_dev", type: "device", deleted: true },
        { path: "t99/d99", type: "device", deleted: false },
      ]);
    });

    it("reports every path when none of them name a device", () => {
      mockNonExistentObjects(); // Unregistered paths should not exist
      const result = deleteObject({ path: "t99/d99", type: "device" });

      expect(result).toStrictEqual({
        path: "t99/d99",
        type: "device",
        deleted: false,
      });
    });

    it("should warn when path is used with non-device/drum-pad type", () => {
      const consoleSpy = vi.spyOn(console, "warn");

      registerMockObject("track_1", {
        path: livePath.track(0),
        type: "Track",
      });

      deleteObject({ id: "track_1", path: "0/0", type: "track" });

      expect(consoleSpy).toHaveBeenCalledWith(
        'delete: path parameter is only valid for types "clip", "device", "drum-pad", or "chain", ignoring paths',
      );
    });

    it("should delete a device nested inside a drum chain by path", () => {
      const { chain, deviceId } = setupNestedDrumDeviceMocks(1);

      const result = deleteObject({ path: "t1/d0/pC1/c0/d0", type: "device" });

      expect(result).toStrictEqual({
        id: deviceId,
        type: "device",
        deleted: true,
      });
      // Should call delete_device on the chain containing the device
      expect(chain.call).toHaveBeenCalledWith("delete_device", 0);
    });

    it("should delete a device nested in a drum pad via the implicit-chain path (pC1/d0)", () => {
      const { chain, deviceId } = setupNestedDrumDeviceMocks(1);

      // Implicit chain 0 — the form the skill recommends for clearing a pad's
      // device, and the form read-device/update-device accept.
      const result = deleteObject({ path: "t1/d0/pC1/d0", type: "device" });

      expect(result).toStrictEqual({
        id: deviceId,
        type: "device",
        deleted: true,
      });
      expect(chain.call).toHaveBeenCalledWith("delete_device", 0);
    });
  });
});
