// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";

/**
 * Assert the rendered disclosure carries the shared zinc surface classes plus
 * the class unique to this kind of disclosure.
 * @param ownClass - The class only this disclosure has
 */
export function expectDisclosureClasses(ownClass: string): void {
  const className = document.querySelector("details")?.className ?? "";

  expect(className).toContain("bg-zinc-200");
  expect(className).toContain("dark:bg-zinc-700");
  expect(className).toContain(ownClass);
}
