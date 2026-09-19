// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { fireEvent, screen } from "@testing-library/preact";
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
