// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMockRegistry,
  mockNonExistentObjects,
} from "#src/test/mocks/mock-registry.ts";
import { readOneDevice } from "#src/tools/device/read/read-device.ts";
import { updateDevice } from "#src/tools/device/update/update-device.ts";
import { select } from "#src/tools/session/select.ts";
import {
  idDoesNotExist,
  validateIdType,
} from "#src/tools/shared/validation/id-validation.ts";

const PATH_HINT = '"t0/d1" is a path, so send it as path, not id';

describe("a path sent as an id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    mockNonExistentObjects();
  });

  it("is told to use path by every shared id lookup", () => {
    const expected = `id "t0/d1" does not exist; ${PATH_HINT}`;

    expect(idDoesNotExist("t0/d1")).toBe(expected);
    expect(() => validateIdType("t0/d1", "device")).toThrow(expected);
    expect(() => readOneDevice({ id: "t0/d1" })).toThrow(expected);
    expect(() => select({ id: "t0/d1" })).toThrow(expected);
    expect(() => updateDevice({ id: "t0/d1", name: "x" })).toThrow(expected);
  });

  it("names the noun when the lookup knows it", () => {
    expect(idDoesNotExist("s2", "scene")).toBe(
      'scene with id "s2" does not exist; "s2" is a path, so send it as path, not id',
    );
  });

  it.each(["123", "2/3", "invalid-id", "id gone", ""])(
    "adds no hint to %j, which is not a path",
    (id) => {
      expect(idDoesNotExist(id)).toBe(`id "${id}" does not exist`);
    },
  );
});
