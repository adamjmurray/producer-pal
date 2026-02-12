// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Test helpers for arrangement-operations-helpers tests.
 * These helpers reduce code duplication in test setups.
 */
import { vi } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

interface ClipProps {
  looping?: number;
  loop_start?: number;
  loop_end?: number;
  start_marker?: number;
  end_marker?: number;
  [key: string]: number | undefined;
}

interface RegisterOptions {
  path?: string;
  type?: string;
  properties?: Record<string, unknown>;
}

function registerArrangementMock(
  id: string,
  options: RegisterOptions = {},
): void {
  registerMockObject(id, options);
}

/**
 * Register arrangement clip and track handles for a given clip ID.
 * @param clipId - The clip ID to match (e.g., "789")
 * @param trackIndex - Track index for the returned path
 */
export function setupArrangementClipPath(
  clipId: string,
  trackIndex: number = 0,
): void {
  registerArrangementMock(`track-${trackIndex}`, {
    path: `live_set tracks ${trackIndex}`,
    type: "Track",
  });
  registerArrangementMock(clipId, {
    path: `live_set tracks ${trackIndex} arrangement_clips 0`,
    type: "Clip",
  });
}

/**
 * Create mock clip properties for arrangement tests.
 * @param overrides - Property overrides
 * @returns Mock clip properties
 */
export function createClipProps(overrides: ClipProps = {}): ClipProps {
  return {
    looping: 1,
    loop_start: 0,
    loop_end: 8,
    start_marker: 0,
    end_marker: 8,
    ...overrides,
  };
}

interface MockClip {
  id: string;
  getProperty: ReturnType<typeof vi.fn>;
  trackIndex: number | null;
}

interface CreateMockClipOptions {
  id?: string;
  trackIndex?: number | null;
  props?: ClipProps;
}

/**
 * Create a mock clip object for arrangement tests.
 * @param options - Options for creating the mock clip
 * @param options.id - Clip ID
 * @param options.trackIndex - Track index (null for error tests)
 * @param options.props - Clip properties (passed to createClipProps)
 * @returns Mock clip object with id, getProperty, and trackIndex
 */
export function createMockClip(options: CreateMockClipOptions = {}): MockClip {
  const { id = "789", trackIndex = 0, props = {} } = options;
  const clipProps = createClipProps(props);

  return {
    id,
    getProperty: vi.fn((prop: string) => clipProps[prop]),
    trackIndex,
  };
}

interface SetupArrangementMocksOptions {
  clipId?: string;
  trackIndex?: number;
  clipProps?: ClipProps;
  extraMocks?: Record<string, Record<string, unknown>>;
}

/**
 * Setup common mocks for arrangement clip tests.
 * Combines path mock and mockLiveApiGet in one call.
 * @param options - Options
 * @param options.clipId - Clip ID
 * @param options.trackIndex - Track index
 * @param options.clipProps - Clip properties (passed to createClipProps)
 * @param options.extraMocks - Additional mocks for mockLiveApiGet
 */
export function setupArrangementMocks(
  options: SetupArrangementMocksOptions = {},
): void {
  const {
    clipId = "789",
    trackIndex = 0,
    clipProps = {},
    extraMocks = {},
  } = options;

  setupArrangementClipPath(clipId, trackIndex);
  registerArrangementMock(clipId, {
    path: `live_set tracks ${trackIndex} arrangement_clips 0`,
    type: "Clip",
    properties: createClipProps(clipProps),
  });

  for (const [id, properties] of Object.entries(extraMocks)) {
    registerArrangementMock(id, { properties });
  }
}
