// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Which targets a request may resolve once and reuse, and — mostly — which it
// may not. See live-api-build.ts for why the safe list is this short.

import { describe, expect, it } from "vitest";
import {
  beginLiveApiScope,
  endLiveApiScope,
  memoizedObject,
} from "#src/live-api-adapter/live-api-release.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";

describe("live-api memo", () => {
  it("hands back the same object for a stable target", () => {
    expect(LiveAPI.from(livePath.liveSet)).toBe(LiveAPI.from(livePath.liveSet));
    expect(LiveAPI.from(livePath.masterTrack())).toBe(
      LiveAPI.from(livePath.masterTrack()),
    );
  });

  // this_device resolves to an indexed path (live_set tracks 3 devices 0), but
  // the held object follows its device: shift a track or a device ahead of it
  // and Live rewrites the path. Measured — see live-api-build.ts.
  it("hands back the same object for this_device", () => {
    expect(LiveAPI.from("this_device")).toBe(LiveAPI.from("this_device"));
  });

  // The one that matters. Tools read a path, mutate, then read the same path
  // again to compare: copyClipToSlot reads the destination slot's clip id,
  // duplicates into it, and re-reads to tell a real copy from the clip that was
  // already there. Reusing the first object turns every copy into "no clip
  // landed".
  it("resolves an ordinary path afresh every time", () => {
    const path = livePath.track(0).clipSlot(0).clip();

    expect(LiveAPI.from(path)).not.toBe(LiveAPI.from(path));
  });

  // Delete re-looks-up the id to find out whether Live went through with it,
  // because the object the delete ran through still reports its old id.
  it("resolves an id target afresh every time", () => {
    expect(LiveAPI.from("id 42")).not.toBe(LiveAPI.from("id 42"));
  });

  // Identity can't show this: the object goes on the free list and the next
  // request pops the same one straight back off, which is pooling working.
  it("forgets a stable target when the request ends", () => {
    beginLiveApiScope();

    LiveAPI.from(livePath.liveSet);

    expect(memoizedObject(livePath.liveSet)).toBeDefined();

    endLiveApiScope();

    expect(memoizedObject(livePath.liveSet)).toBeUndefined();
  });

  // A remembered object is checked before it is handed back, so a Live version
  // that drops one of these paths costs a rebuild rather than a wrong answer.
  it("rebuilds a stable target that has stopped existing", () => {
    const first = LiveAPI.from(livePath.liveSet);

    expect(first.exists()).toBe(true);

    mockNonExistentObjects();

    expect(LiveAPI.from(livePath.liveSet)).not.toBe(first);
  });
});
