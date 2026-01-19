import { Mock } from "vitest";

/** Context available in mockImplementation callbacks for LiveAPI mocks */
export interface MockLiveAPIContext {
  _path?: string;
  _id?: string;
  path?: string;
  id?: string;
  type?: string;
}

/** Typed mock function with proper this context */
export type LiveAPIMockFn<
  TArgs extends unknown[] = unknown[],
  TReturn = unknown,
> = Mock<(this: MockLiveAPIContext, ...args: TArgs) => TReturn>;

export class MockSequence extends Array<unknown> {}

export const liveApiId: LiveAPIMockFn<[], string>;
export const liveApiPath: LiveAPIMockFn<[], string | undefined>;
export const liveApiType: LiveAPIMockFn<[], string | undefined>;
export const liveApiGet: LiveAPIMockFn<[string], unknown[]>;
export const liveApiSet: LiveAPIMockFn<[string, unknown], void>;
export const liveApiCall: LiveAPIMockFn<[string, ...unknown[]], unknown>;

export class LiveAPI {
  constructor(path?: string);
  static from(idOrPath: string | number | string[]): LiveAPI;

  _path?: string;
  _id?: string;
  readonly id: string;
  readonly path: string;
  readonly unquotedpath: string;
  readonly type: string;

  exists(): boolean;
  get: Mock;
  set: Mock;
  call: Mock;
  getChildIds(name: string): string[];
  getChildren(name: string): LiveAPI[];
  getProperty(property: string): unknown;

  // Extension properties added by live-api-extensions.js
  readonly trackIndex: number | null;
  readonly returnTrackIndex: number | null;
  readonly category: "regular" | "return" | "master" | null;
  readonly sceneIndex: number | null;
  readonly clipSlotIndex: number | null;
  readonly deviceIndex: number | null;
  readonly timeSignature: string | null;
  getColor(): string | null;
  setColor(cssColor: string): void;
  setProperty(property: string, value: unknown): void;
  setAll(properties: Record<string, unknown>): void;
}

/** Mock the LiveAPI.get() method with optional custom overrides */
export function mockLiveApiGet(
  overrides?: Record<string, Record<string, unknown>>,
): void;

/** Create expected track result for assertions */
export function expectedTrack(overrides?: Record<string, unknown>): {
  id: string;
  type: string;
  name: string;
  trackIndex: number;
  color: string;
  isArmed: boolean;
  arrangementFollower: boolean;
  playingSlotIndex: number;
  firedSlotIndex: number;
  arrangementClips: unknown[];
  sessionClips: unknown[];
  instrument: unknown;
};

/** Create expected scene result for assertions */
export function expectedScene(overrides?: Record<string, unknown>): {
  id: string;
  name: string;
  sceneIndex: number;
  color: string;
  isEmpty: boolean;
  tempo: string;
  timeSignature: string;
};

/** Create expected clip result for assertions */
export function expectedClip(overrides?: Record<string, unknown>): {
  id: string;
  type: string;
  view: string;
  trackIndex: number;
  sceneIndex: number;
  name: string;
  color: string;
  timeSignature: string;
  looping: boolean;
  start: string;
  end: string;
  length: string;
  noteCount: number;
  notes: string;
};

/** Create Live API children array format from child IDs */
export function children(...childIds: string[]): string[];
