// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import packageJson from "../../package.json" with { type: "json" };

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "overrides",
];

describe("package.json dependency versions", () => {
  it("should use exact versions for all dependencies", () => {
    const violations = collectViolations(
      packageJson as unknown as Record<string, unknown>,
    );

    expect(violations).toStrictEqual([]);
  });
});

function collectViolations(
  pkg: Record<string, unknown>,
  prefix = "",
): string[] {
  const violations: string[] = [];

  for (const field of DEPENDENCY_FIELDS) {
    const deps = pkg[field] as Record<string, unknown> | undefined;

    for (const [name, value] of Object.entries(deps ?? {})) {
      const label = prefix ? `${prefix} > ${name}` : `${field} > ${name}`;

      if (typeof value === "string" && !EXACT_VERSION.test(value)) {
        violations.push(`${label}: "${value}"`);
      } else if (typeof value === "object" && value != null) {
        violations.push(
          ...collectViolations(
            { overrides: value } as Record<string, unknown>,
            label,
          ),
        );
      }
    }
  }

  return violations;
}
