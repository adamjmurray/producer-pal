// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Keeps the widget list in the Live Set, the way the project context is kept:
// in a hidden parameter on the device (tab-context.maxpat), which Live saves
// inside the .als. Each Set has its own device, so each has its own widgets, an
// unsaved Set works for the session, and a Set switch brings its list with it.
//
// A central file keyed by Set (the old ~/.producer-pal store) was rejected for
// the same reasons as for the project context: see
// dev/tools/memory-system/ppal-context-tool.md.
//
// No backup file beside the .als: that exists so a device upgrade keeps the
// project notes. A widget list is view state, cheap to make again.

import Max from "max-api";
import { errorMessage } from "#src/shared/error-message.ts";
import { textEditParamToString } from "#src/shared/max/max-atoms.ts";
import * as console from "../../node-for-max-logger.ts";
import { loadWidgetsFromSet, setWidgetSink } from "./widget-store.ts";

/**
 * Save widget changes into the device's parameter, and load the list the Set
 * holds when the device tells us. Safe to call once at startup.
 */
export function connectWidgetsToSet(): void {
  Max.addHandler("genUiWidgets", (content: unknown) => {
    loadWidgetsFromSet(textEditParamToString(content));
  });

  setWidgetSink((text) => {
    // Fire and forget: a failed save mustn't fail the change that caused it.
    Max.outlet("config", "genUiWidgets", text).catch((error: unknown) => {
      console.warn(`Could not save the UI widgets: ${errorMessage(error)}`);
    });
  });
}
