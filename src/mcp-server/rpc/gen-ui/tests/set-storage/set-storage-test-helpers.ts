// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import Max from "max-api";
import { expect, vi } from "vitest";
import { type Widget } from "#src/shared/gen-ui-types.ts";
import { RETRY_MS, SAVE_DELAY_MS, SetStorage } from "../../set-storage.ts";
import { decodeWidgets, encodeWidgets } from "../../widget-blob.ts";
import {
  listWidgets,
  loadWidgetsFromSet,
  setWidgetSink,
} from "../../widget-store.ts";
import { type FakeScript } from "../gen-ui-test-helpers.ts";

/**
 * A SetStorage on the fake script, wired to the real widget store.
 * @param script - The fake remote script
 * @returns The storage; the store saves through it
 */
export function connectToScript(script: FakeScript): SetStorage {
  const storage = new SetStorage({
    request: script.request,
    load: loadWidgetsFromSet,
    currentText: () => encodeWidgets(listWidgets()),
  });

  setWidgetSink((text) => storage.save(text));

  return storage;
}

/**
 * @param widgets - The widgets a Set holds
 * @returns The text the script would hold
 */
export function textOf(widgets: Widget[]): string {
  return encodeWidgets(widgets) as string;
}

/**
 * @param text - A saved list
 * @returns The widgets in it
 */
export function widgetsIn(text: string | undefined): Widget[] {
  return decodeWidgets(text ?? "") ?? [];
}

/** @returns The warnings the device has posted, as text */
export function warnings(): string[] {
  return vi
    .mocked(Max.post)
    .mock.calls.filter(([, level]) => level === Max.POST_LEVELS.WARN)
    .map(([text]) => (typeof text === "string" ? text : ""));
}

/** Expect the script to have been asked to save, never before it was asked to load. */
export function expectLoadedBeforeFirstSave(script: FakeScript): void {
  const routes = script.requests.map((r) => r.route);
  const firstSave = routes.indexOf("/ui-widgets/save");

  if (firstSave >= 0) {
    expect(routes.indexOf("/ui-widgets")).toBeGreaterThanOrEqual(0);
    expect(routes.indexOf("/ui-widgets")).toBeLessThan(firstSave);
  }
}

/**
 * Make changes while the script is silent, then bring it up and let the storage
 * find it.
 * @param script - The fake remote script
 * @param storage - The storage under test
 * @param change - What the user does before the Set's list is loaded
 */
export async function loadAfterEarlyChange(
  script: FakeScript,
  storage: SetStorage,
  change: () => void,
): Promise<void> {
  script.down = {};
  storage.start();
  change();
  await vi.advanceTimersByTimeAsync(RETRY_MS);
  script.down = false;
  await vi.advanceTimersByTimeAsync(RETRY_MS + SAVE_DELAY_MS);
}
