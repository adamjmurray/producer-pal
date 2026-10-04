// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  deleteMockObject,
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** The message every injected Live failure carries. */
export const LIVE_FAILURE = "Live refused the write";

/**
 * Make a mock throw when it is written to, the way Live does when it refuses.
 * @param mock - The registered object
 * @param property - Only this property throws; any write does when omitted
 */
export function failOnSet(mock: RegisteredMockObject, property?: string): void {
  mock.set.mockImplementation((written: string) => {
    if (property == null || written === property) {
      throw new Error(LIVE_FAILURE);
    }
  });
}

/**
 * Run code around the calls to a mock that match a method, counting them from 1.
 * @param mock - The registered object
 * @param method - Which calls to count
 * @param hooks - What to do just before and just after the counted call
 * @param hooks.before - Runs before the nth matching call; may throw
 * @param hooks.after - Runs once the nth matching call has gone through, with what it returned
 */
export function hookCalls(
  mock: RegisteredMockObject,
  method: RegExp,
  hooks: {
    before?: (nth: number, args: unknown[]) => void;
    after?: (nth: number, args: unknown[], result: unknown) => void;
  },
): void {
  const original = mock.call.getMockImplementation();
  let nth = 0;

  mock.call.mockImplementation((name: string, ...args: unknown[]) => {
    const counted = method.test(name);

    if (counted) {
      nth++;
      hooks.before?.(nth, args);
    }

    const result = original?.(name, ...args);

    if (counted) {
      hooks.after?.(nth, args, result);
    }

    return result;
  });
}

/**
 * Make the nth call to a matching method throw, the way Live does when it
 * refuses.
 * @param mock - The registered object the method is called on
 * @param method - Which calls count
 * @param nth - Which call throws, counting from 1
 */
export function failCall(
  mock: RegisteredMockObject,
  method: RegExp,
  nth: number,
): void {
  hookCalls(mock, method, {
    before: (count) => {
      if (count === nth) {
        throw new Error(LIVE_FAILURE);
      }
    },
  });
}

/**
 * Make the object the nth matching call creates refuse every write, so the
 * target is made and then won't take its name.
 * @param mock - The registered object the creating method is called on
 * @param method - Which calls create objects
 * @param nth - Which creating call's object refuses, counting from 1
 */
export function failOnCreated(
  mock: RegisteredMockObject,
  method: RegExp,
  nth: number,
): void {
  hookCalls(mock, method, {
    after: (count, _args, result) => {
      if (count === nth) {
        failOnSet(
          lookupMockObject(
            String((result as string[])[1]),
          ) as RegisteredMockObject,
        );
      }
    },
  });
}

/**
 * Register a Live Set with `count` tracks, ids `t0`, `t1`, ...
 * @param count - How many tracks
 * @returns The tracks, in index order
 */
export function registerTracks(count: number): RegisteredMockObject[] {
  const ids = Array.from({ length: count }, (_, i) => `t${i}`);

  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { tracks: children(...ids) },
  });

  return ids.map((id, i) =>
    registerMockObject(id, { path: livePath.track(i) }),
  );
}

/**
 * Register a Live Set with `count` scenes, ids `s0`, `s1`, ...
 * @param count - How many scenes
 * @returns The scenes, in index order
 */
export function registerScenes(count: number): RegisteredMockObject[] {
  const ids = Array.from({ length: count }, (_, i) => `s${i}`);

  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { scenes: children(...ids) },
  });

  return ids.map((id, i) =>
    registerMockObject(id, { path: livePath.scene(i) }),
  );
}

/**
 * The order the suite names targets in: not the order they sit in, so an entry
 * list that sorts or reverses them can't pass by accident.
 * @param count - How many targets
 * @returns Indexes 0..count-1, rotated by one (2, 0, 1 for three)
 */
export function namedOrder(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + count - 1) % count);
}

/**
 * Make the arrangement clips a track gets clear the clips they cover whole, the
 * way Live does, and give each the start and end it was placed at. A clip a new
 * one covers only part of is left alone: Live would trim it, and this doesn't.
 * @param track - The registered track
 * @param beats - How long a clip placed there is, or a function of its call args
 */
export function clearCoveredClips(
  track: RegisteredMockObject,
  beats: number | ((args: unknown[]) => number),
): void {
  hookCalls(track, /^(duplicate_clip_to_arrangement|create_midi_clip)$/, {
    before: (_nth, args) => {
      const [start, end] = span(args, beats);

      for (const mock of arrangementClips(track)) {
        const { start_time: from, end_time: to } = mock.properties;

        if ((from as number) >= start && (to as number) <= end) {
          deleteMockObject(mock.id);
        }
      }
    },
    after: (_nth, args, result) => {
      const [start, end] = span(args, beats);
      const placed = lookupMockObject(String((result as unknown[])[1]));

      if (placed != null) {
        Object.assign(placed.properties, {
          is_arrangement_clip: 1,
          start_time: start,
          end_time: end,
        });
      }
    },
  });
}

/**
 * Where a call places a clip.
 * @param args - The call's args
 * @param beats - The clip's length, or a function of the args
 * @returns The start and end in beats
 */
function span(
  args: unknown[],
  beats: number | ((args: unknown[]) => number),
): [number, number] {
  const start = Number(
    typeof args[0] === "string" && args[0].startsWith("id") ? args[1] : args[0],
  );

  return [start, start + (typeof beats === "number" ? beats : beats(args))];
}

/**
 * The arrangement clips registered on a track.
 * @param track - The registered track
 * @returns The clips
 */
function arrangementClips(track: RegisteredMockObject): RegisteredMockObject[] {
  return [track.path]
    .flatMap((path) =>
      Array.from({ length: 20 }, (_, i) =>
        lookupMockObject(undefined, `${path} arrangement_clips ${i}`),
      ),
    )
    .filter((mock) => mock != null);
}

/**
 * Make a copy onto a slot replace the clip already there, as Live does: the old
 * clip dies and the copy is a new object.
 * @param source - The registered slot copies are made from
 */
export function replaceClipOnCopy(source: RegisteredMockObject): void {
  hookCalls(source, /^duplicate_clip_to$/, {
    before: (_nth, args) => {
      const bare = String(args[0]).replace(/^id /, "");
      const slot = lookupMockObject(bare)?.path ?? bare.replaceAll("/", " ");

      deleteMockObject(`${slot} clip`);
    },
  });
}

/**
 * The id at one place in a registered child list.
 * @param owner - The registered parent
 * @param property - The list's property (`tracks`, ...)
 * @param index - Where in the list
 * @returns The id there
 */
export function childIdAt(
  owner: RegisteredMockObject,
  property: string,
  index: number,
): string {
  return String((owner.properties[property] as unknown[])[index * 2 + 1]);
}
