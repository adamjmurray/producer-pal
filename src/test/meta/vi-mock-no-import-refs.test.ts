// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { throwOnFileViolations } from "#src/test/helpers/meta-test-helpers.ts";
import { findMockImportRefViolations } from "#src/test/helpers/vi-mock-scan-test-helpers.ts";

// An async vi.mock() factory (the `async (importOriginal) => …` partial-mock
// form) is hoisted above the file's imports, and Vitest does not auto-hoist the
// imports it references after an `await`. Referencing an imported binding inside
// it throws a temporal-dead-zone error the first time the file runs cold. The
// throw is order-dependent — masked when another test file warms the module
// graph first — so it slips through a local run and only fails in CI. Catch it
// statically instead. (Synchronous factories are fine — Vitest hoists their
// imports — so they are not scanned.)
describe("no import references inside async vi.mock() factories", () => {
  it("does not reference module-scope imports in any async vi.mock() factory", () => {
    const violations = findMockImportRefViolations();

    throwOnFileViolations(
      violations.map((v) => ({
        file: `${v.file}:${v.line}`,
        reason: `async vi.mock() factory references the import "${v.name}"`,
      })),
      "Found import reference(s) inside async vi.mock() factories",
      "vi.mock is hoisted above imports and Vitest does not auto-hoist imports " +
        "used after an await, so the binding is in its temporal dead zone when " +
        "the async factory resumes (a cold-start crash that only shows up in " +
        "CI). Move the value into vi.hoisted(), or set it at test time in " +
        "beforeEach instead of in the factory.",
    );

    expect(violations).toHaveLength(0);
  });
});
