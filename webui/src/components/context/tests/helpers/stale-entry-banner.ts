// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { fireEvent, screen } from "@testing-library/preact";
import { type ComponentChild, render as preactRender } from "preact";
import { expect } from "vitest";

/**
 * Click Reload on an editor's stale-entry banner, checking the banner was
 * showing beforehand and is gone afterwards.
 * @param bannerText - The banner message this editor shows
 */
export function reloadStaleEntry(bannerText: string): void {
  expect(screen.getByText(bannerText)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Reload" }));

  expect(screen.queryByText(bannerText)).toBeNull();
}

/**
 * Click Reload in the same frame the entry is deleted: an outside edit shows
 * the banner, then the deletion commits without flushing effects.
 * @param rerender - The render result's rerender
 * @param container - The render result's container
 * @param changed - The editor showing the entry edited from outside
 * @param deleted - The editor with the entry gone
 */
export function reloadAsEntryIsDeleted(
  rerender: (ui: ComponentChild) => void,
  container: Element,
  changed: ComponentChild,
  deleted: ComponentChild,
): void {
  rerender(changed);
  preactRender(deleted, container);
  screen.getByRole("button", { name: "Reload" }).click();
}
