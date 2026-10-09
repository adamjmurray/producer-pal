// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import Max from "max-api";
import { errorMessage } from "#src/shared/error-message.ts";
import * as console from "../../node-for-max-logger.ts";
import { updateGlobalSettings } from "../config-store/global-settings-store.ts";
import { getUpdate } from "./update-check.ts";

/**
 * Dismiss the current update notification from the device's × button: save the
 * version to the global settings (the same setting the chat UI writes), then
 * hide the device's notice. If the save fails, the notice stays up and a warning
 * goes to the Max console, so the device never claims a dismissal that won't
 * survive the next load.
 */
export async function dismissUpdate(): Promise<void> {
  const update = await getUpdate();

  if (update != null) {
    try {
      updateGlobalSettings({ dismissedUpdateVersion: update.version });
    } catch (error) {
      console.warn(
        `Could not save the update dismissal: ${errorMessage(error)}`,
      );

      return;
    }
  }

  await syncDeviceUpdateNotice();
}

/**
 * Hide the device's update notice if there is no update to show, such as after a
 * dismissal in the device or the chat UI. The device only learns about an update
 * at startup, so this push is how a later change reaches it. Safe to call when
 * the notice is already hidden.
 */
export async function syncDeviceUpdateNotice(): Promise<void> {
  if ((await getUpdate()) == null) {
    // Rides the "config" outlet like the device's other settings. The 1 is a
    // dummy value: the patch's route needs the same "name value" shape as the
    // rest of them.
    void Max.outlet("config", "updateDismissed", 1);
  }
}
