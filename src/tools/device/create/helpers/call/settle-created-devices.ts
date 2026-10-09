// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type Done } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { type CreateDeviceResult } from "../device-creation.ts";
import { type CreateChecked } from "./check-create-call.ts";
import { type CreatePayload } from "./parse-create-call.ts";

/**
 * Stage 5: once every target has had its turn, name each device where it sits
 * now, since a later insert can push an earlier one along, and focus the last
 * device the call created.
 * @param done - What the call did
 * @param done.checked - The checked call
 * @param done.entries - One entry per target
 * @param done.outcomes - What happened to each target
 */
export function settleCreatedDevices({
  checked,
  entries,
  outcomes,
}: Done<CreatePayload, CreateChecked, CreateDeviceResult>): void {
  const created: string[] = [];

  for (const [index, entry] of entries.entries()) {
    const { id } = entry as Partial<CreateDeviceResult>;

    if (outcomes[index] !== "written" || id == null) {
      continue;
    }

    const placed = checked.placed.get(id);

    if (placed != null) {
      const { path } = pathField(placed.device, placed.written);

      if (path == null) {
        delete (entry as CreateDeviceResult).path;
      } else {
        (entry as CreateDeviceResult).path = path;
      }
    }

    created.push(id);
  }

  const last = created.at(-1);

  if (checked.focus === true && last != null) {
    focusSelect({ id: last, detailView: "device" });
  }
}
