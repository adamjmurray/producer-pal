// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { applySpecializedParamWrite } from "../specialized-device-registry.ts";

/**
 * Register the `write monoPoly` suite for a device that exposes the shared
 * mono/poly pseudo-param. Meld and Spectral Resonator both map the same two
 * enum labels onto `mono_poly`, so the cases are identical apart from which
 * device gets registered — that is the only thing the caller supplies.
 *
 * @param registerDevice - Registers the device mock and returns its LiveAPI
 */
export function registerMonoPolyWriteTests(
  registerDevice: (properties?: Record<string, unknown>) => LiveAPI,
): void {
  describe("write monoPoly", () => {
    it("maps the enum label 'mono' to index 0", () => {
      const device = registerDevice({ mono_poly: 1 });

      applySpecializedParamWrite(device, "monoPoly", "mono", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("mono_poly", 0);
    });

    it("maps the enum label 'poly' to index 1", () => {
      const device = registerDevice();

      applySpecializedParamWrite(device, "monoPoly", "poly", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("mono_poly", 1);
    });

    it("is case-insensitive on the param name", () => {
      const device = registerDevice();

      applySpecializedParamWrite(device, "monopoly", "poly", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("mono_poly", 1);
    });

    it("warns and skips an invalid monoPoly label", () => {
      const device = registerDevice();

      applySpecializedParamWrite(device, "monoPoly", "stereo", "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("not a valid monoPoly"),
      );
    });
  });
}
