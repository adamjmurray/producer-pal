// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type RegisteredMockObject } from "./mock-registry-helpers.ts";

/** What the edits need from the registry, passed in to avoid an import cycle. */
export interface MockRegistryAccess {
  /** Every registered object that still exists */
  all: () => RegisteredMockObject[];
  /** Look an object up by id or path */
  lookup: (idOrPath: string) => RegisteredMockObject | undefined;
  /** Register a new object, with an id of its own, at a path */
  create: (path: string) => { id: string };
  /** Rewrite paths in one go, so one move can't clobber another */
  relocate: (moves: [RegisteredMockObject, string][]) => void;
  /** Make a path read as nothing, as the last one does once a delete closes up */
  markGone: (path: string) => void;
}

/** The result of a call the model handles; `value` is what Live returns. */
export interface EditResult {
  value: unknown;
}

const SLOT_PATH = /^(live_set tracks \d+ clip_slots )(\d+)(.*)$/;
const DEVICE_PATH = /^(.+) devices (\d+)$/;
const INDEXED_PATH =
  /^(.+) (tracks|return_tracks|scenes|devices|chains|arrangement_clips) (\d+)$/;

let created = 0;

/** Restart the numbering of ids handed out to created objects. */
export function resetMockCreatedIds(): void {
  created = 0;
}

/**
 * The id for a new object. Unique per test, and far from the ids tests pick.
 * @returns A numeric id string
 */
export function newMockId(): string {
  created++;

  return String(90_000 + created);
}

/**
 * Make a call change the Live Set's structure the way Live does: something is
 * inserted and every later sibling moves down one.
 *
 * Models creating and duplicating tracks and scenes, inserting devices and
 * chains, and creating clips. Not modeled: what a duplicate copies along (its
 * devices and clips), `move_device` unless asked ({@link applyMockMove}), and an
 * arrangement clip overwriting what it lands on.
 * @param reg - The registry
 * @param method - Live API method name
 * @param args - Call arguments
 * @param path - The calling object's path
 * @returns The call's result, or undefined when the model doesn't cover it
 */
export function applyMockInsert(
  reg: MockRegistryAccess,
  method: string,
  args: unknown[],
  path: string,
): EditResult | undefined {
  switch (method) {
    case "create_midi_track":
    case "create_audio_track":
      return idResult(insertAt(reg, path, "tracks", asIndex(args[0])));
    case "create_return_track":
      return idResult(insertAt(reg, path, "return_tracks", undefined));
    case "create_scene":
      return idResult(insertScene(reg, asIndex(args[0])));
    case "duplicate_scene":
      insertScene(reg, Number(args[0]) + 1);

      return { value: null };
    case "duplicate_track":
      insertAt(reg, path, "tracks", Number(args[0]) + 1, true);

      return { value: null };
    case "insert_device":
      return idResult(insertAt(reg, path, "devices", asIndex(args[1])));
    case "insert_chain":
      return idResult(insertAt(reg, path, "chains", asIndex(args[0])));
    default:
      return applyMockClipCreate(reg, method, args, path);
  }
}

/**
 * Remove everything under a deleted object and close the gap it left.
 * @param reg - The registry
 * @param deletedPath - The deleted object's path
 * @param remove - Marks one object deleted
 */
export function applyMockRemoval(
  reg: MockRegistryAccess,
  deletedPath: string,
  remove: (mock: RegisteredMockObject) => void,
): void {
  for (const mock of reg.all()) {
    if (mock.path.startsWith(`${deletedPath} `)) {
      remove(mock);
    }
  }

  const [, slot] = /^(.+ clip_slots \d+) clip$/.exec(deletedPath) ?? [];
  const slotMock = slot == null ? undefined : reg.lookup(slot);

  if (slotMock != null) {
    slotMock.properties.has_clip = 0;
  }

  const [, parent = "", name = "", digits = ""] =
    INDEXED_PATH.exec(deletedPath) ?? [];

  if (parent === "") {
    return;
  }

  const index = Number(digits);
  const size = Math.max(collectionSize(reg, parent, name), index + 1);

  if (parent === "live_set" && name === "scenes") {
    removeSlotsAt(reg, index, remove);
    dropSlotIds(reg, index);
  }

  editChildList(reg, parent, name, index, "remove");
  shiftSiblings(reg, parent, name, index + 1, -1);

  // Everything after it moved down, so the last place is empty now.
  reg.markGone(`${parent} ${name} ${size - 1}`);

  if (parent === "live_set" && name === "scenes") {
    for (let t = 0; t < collectionSize(reg, parent, "tracks"); t++) {
      reg.markGone(`live_set tracks ${t} clip_slots ${size - 1}`);
    }
  }
}

/**
 * Creating or duplicating a clip. A session clip fills a slot, so nothing
 * shifts; an arrangement clip is inserted in start-time order.
 * @param reg - The registry
 * @param method - Live API method name
 * @param args - Call arguments
 * @param path - The calling object's path
 * @returns The call's result, or undefined when the model doesn't cover it
 */
function applyMockClipCreate(
  reg: MockRegistryAccess,
  method: string,
  args: unknown[],
  path: string,
): EditResult | undefined {
  const isSlot = / clip_slots \d+$/.test(path);

  if (method === "create_clip" || (method === "create_audio_clip" && isSlot)) {
    fillSlot(reg, path);

    return { value: null };
  }

  if (method === "duplicate_clip_to") {
    fillSlot(reg, pathOfId(reg, args[0]));

    return { value: null };
  }

  const start = arrangementStart(method, args);

  return start == null
    ? undefined
    : idResult(insertArrangementClip(reg, path, start));
}

/**
 * Where a call puts a clip on the arrangement.
 * @param method - Live API method name
 * @param args - Call arguments
 * @returns The start in beats, or undefined when the call isn't one of those
 */
function arrangementStart(method: string, args: unknown[]): number | undefined {
  if (method === "create_midi_clip") {
    return Number(args[0]);
  }

  if (
    method === "create_audio_clip" ||
    method === "duplicate_clip_to_arrangement"
  ) {
    return Number(args[1]);
  }

  return undefined;
}

/**
 * The path an id names. An object nobody registered has its path for an id,
 * with slashes for spaces.
 * @param reg - The registry
 * @param arg - "id N" or the bare id
 * @returns The path, or "" when the id names nothing known
 */
function pathOfId(reg: MockRegistryAccess, arg: unknown): string {
  const bare = String(arg).replace(/^id /, "");

  return (
    reg.lookup(bare)?.path ??
    (bare.includes("/") ? bare.replaceAll("/", " ") : "")
  );
}

function idResult(id: string): EditResult {
  return { value: ["id", id] };
}

function asIndex(arg: unknown): number | undefined {
  const index = Number(arg);

  return arg == null || Number.isNaN(index) || index < 0 ? undefined : index;
}

/**
 * Insert an object into one of a parent's collections. Later siblings, and
 * everything under them, move down one.
 * @param reg - The registry
 * @param parent - The collection's owner (`live_set`, a track, a rack)
 * @param name - The collection (`tracks`, `devices`, ...)
 * @param index - Where it goes; undefined for the end
 * @param pad - Take the index as given even if it is past the end, and make up
 *   ids for the child list to reach it
 * @returns The new object's id
 */
function insertAt(
  reg: MockRegistryAccess,
  parent: string,
  name: string,
  index: number | undefined,
  pad = false,
): string {
  const size = collectionSize(reg, parent, name);
  const at = pad && index != null ? index : Math.min(index ?? Infinity, size);

  shiftSiblings(reg, parent, name, at, 1);

  const path = `${parent} ${name} ${at}`;
  const { id } = reg.create(path);

  editChildList(reg, parent, name, at, "insert", id);

  if (parent === "live_set" && name === "tracks") {
    addSlotsToTrack(reg, path);
  }

  return id;
}

/**
 * Make a `move_device` call move the device the way Live does.
 * @param reg - The registry
 * @param args - Call arguments: the device, the container, and where in it
 */
export function applyMockMove(reg: MockRegistryAccess, args: unknown[]): void {
  moveDevice(reg, args[0], args[1], asIndex(args[2]));
}

/**
 * Move a device, and everything under it, into another container. The devices
 * after it close up where it was and the ones at its new place move down one.
 * @param reg - The registry
 * @param deviceArg - "id N" or the bare id of the device
 * @param containerArg - "id N" or the bare id of the track or chain it goes to
 * @param index - Where in the container; undefined for the end
 */
function moveDevice(
  reg: MockRegistryAccess,
  deviceArg: unknown,
  containerArg: unknown,
  index: number | undefined,
): void {
  const device = reg.lookup(pathOfId(reg, deviceArg));
  const from = DEVICE_PATH.exec(device?.path ?? "");
  const container = pathOfId(reg, containerArg);
  const owner = reg.lookup(container);

  if (device == null || from == null || owner == null) {
    return;
  }

  const [, fromParent = "", fromDigits = ""] = from;
  const fromPath = device.path;
  const moving = reg
    .all()
    .filter(
      (mock) => mock.path === fromPath || mock.path.startsWith(`${fromPath} `),
    );
  // Held apart while the places it leaves and takes are made to fit.
  const held = (mock: RegisteredMockObject): string => `moving ${mock.path}`;

  reg.relocate(moving.map((mock) => [mock, held(mock)]));
  shiftSiblings(reg, fromParent, "devices", Number(fromDigits) + 1, -1);
  editChildList(reg, fromParent, "devices", Number(fromDigits), "remove");

  const at = Math.min(
    index ?? Infinity,
    collectionSize(reg, container, "devices"),
  );

  shiftSiblings(reg, container, "devices", at, 1);
  owner.properties.devices ??= [];
  editChildList(reg, container, "devices", at, "insert", device.id);
  const heldPrefix = `moving ${fromPath}`.length;

  reg.relocate(
    moving.map((mock) => {
      const inside = mock.path.slice(heldPrefix);

      return [mock, `${container} devices ${at}${inside}`];
    }),
  );
}

/**
 * Give a new track one clip slot per scene, as Live does.
 * @param reg - The registry
 * @param trackPath - The new track's path
 */
function addSlotsToTrack(reg: MockRegistryAccess, trackPath: string): void {
  const track = reg.lookup(trackPath);
  const scenes = collectionSize(reg, "live_set", "scenes");

  if (track == null || scenes === 0 || track.properties.clip_slots != null) {
    return;
  }

  track.properties.clip_slots = Array.from(
    { length: scenes },
    (_, s) => reg.create(`${trackPath} clip_slots ${s}`).id,
  ).flatMap((id) => ["id", id]);
}

/**
 * Insert a scene. Every track gains a clip slot at the same index.
 * @param reg - The registry
 * @param index - Where it goes; undefined for the end
 * @returns The new scene's id
 */
function insertScene(
  reg: MockRegistryAccess,
  index: number | undefined,
): string {
  const at = Math.min(
    index ?? Infinity,
    collectionSize(reg, "live_set", "scenes"),
  );

  const id = insertAt(reg, "live_set", "scenes", at);

  for (let t = 0; t < collectionSize(reg, "live_set", "tracks"); t++) {
    const slot = reg.create(`live_set tracks ${t} clip_slots ${at}`);

    editChildList(
      reg,
      `live_set tracks ${t}`,
      "clip_slots",
      at,
      "insert",
      slot.id,
    );
  }

  return id;
}

/**
 * Put a new clip in a session slot, unless one is already registered there to
 * stand in for it.
 * @param reg - The registry
 * @param slotPath - The clip slot's path
 */
function fillSlot(reg: MockRegistryAccess, slotPath: string): void {
  const clipPath = `${slotPath} clip`;

  if (slotPath === "") {
    return;
  }

  if (reg.lookup(clipPath) == null) {
    reg.create(clipPath);
  }

  const slot = reg.lookup(slotPath);

  if (slot != null) {
    slot.properties.has_clip = 1;
  }
}

/**
 * Insert an arrangement clip where its start time puts it. Without a start
 * time on every sibling there is no order to follow, so it goes last.
 * @param reg - The registry
 * @param track - The track's path
 * @param position - The clip's start, in beats
 * @returns The new clip's id
 */
function insertArrangementClip(
  reg: MockRegistryAccess,
  track: string,
  position: number,
): string {
  const siblings = reg
    .all()
    .filter((mock) => mock.path.startsWith(`${track} arrangement_clips `));
  const starts = siblings.map((mock) => mock.properties.start_time);
  const size = collectionSize(reg, track, "arrangement_clips");
  const ordered =
    siblings.length === size &&
    starts.every((start) => typeof start === "number");

  return insertAt(
    reg,
    track,
    "arrangement_clips",
    ordered ? starts.filter((start) => start < position).length : size,
  );
}

/**
 * How many objects a collection holds, as far as the registry knows: the
 * larger of its child list and the highest registered index plus one.
 * @param reg - The registry
 * @param parent - The collection's owner
 * @param name - The collection
 * @returns The size
 */
function collectionSize(
  reg: MockRegistryAccess,
  parent: string,
  name: string,
): number {
  const prefix = `${parent} ${name} `;
  let size = idsOf(reg.lookup(parent)?.properties[name])?.length ?? 0;

  for (const { path } of reg.all()) {
    const digits = path.startsWith(prefix)
      ? /^\d+/.exec(path.slice(prefix.length))?.[0]
      : undefined;
    // A clip slot at an index means there is a scene there.
    const slot =
      parent === "live_set" && name === "scenes"
        ? SLOT_PATH.exec(path)?.[2]
        : undefined;

    for (const found of [digits, slot]) {
      if (found != null) {
        size = Math.max(size, Number(found) + 1);
      }
    }
  }

  return size;
}

/**
 * Move every registered object past a point one place along its collection,
 * together with everything underneath it.
 * @param reg - The registry
 * @param parent - The collection's owner
 * @param name - The collection
 * @param from - The first index that moves
 * @param delta - +1 for an insert, -1 for a removal
 */
function shiftSiblings(
  reg: MockRegistryAccess,
  parent: string,
  name: string,
  from: number,
  delta: 1 | -1,
): void {
  const escaped = `${parent} ${name} `.replaceAll(
    /[.*+?^${}()|[\]\\]/g,
    String.raw`\$&`,
  );
  const patterns = [new RegExp(`^(${escaped})(\\d+)(.*)$`)];

  // A scene's index is also the index of its clip slot on every track.
  if (parent === "live_set" && name === "scenes") {
    patterns.push(SLOT_PATH);
  }

  const moves: [RegisteredMockObject, string][] = [];

  for (const mock of reg.all()) {
    for (const pattern of patterns) {
      const [, head, digits = "", tail = ""] = pattern.exec(mock.path) ?? [];

      if (head != null && Number(digits) >= from) {
        moves.push([mock, `${head}${Number(digits) + delta}${tail}`]);
        break;
      }
    }
  }

  reg.relocate(moves);
}

/**
 * The ids in a registered child list, which holds `["id", x, "id", y, ...]`.
 * @param list - The property value
 * @returns The ids, or undefined when the value isn't a list of that shape
 */
function idsOf(list: unknown): string[] | undefined {
  if (!Array.isArray(list)) {
    return undefined;
  }

  const shaped = list.every((item, i) => i % 2 === 1 || item === "id");

  return shaped ? list.filter((_, i) => i % 2 === 1).map(String) : undefined;
}

/**
 * Keep a parent's child list in step with an insert or a removal. A list
 * shorter than the index gets made-up ids up to it.
 * @param reg - The registry
 * @param parent - The collection's owner
 * @param name - The collection
 * @param index - The index inserted at or removed
 * @param op - What happened
 * @param id - The inserted object's id
 */
function editChildList(
  reg: MockRegistryAccess,
  parent: string,
  name: string,
  index: number,
  op: "insert" | "remove",
  id?: string,
): void {
  const owner = reg.lookup(parent);
  const listed = owner?.properties[name];
  // A Live Set that registers no track list gets one from the first track made.
  const ids =
    idsOf(listed) ??
    (listed === undefined && op === "insert" && name === "tracks"
      ? []
      : undefined);

  if (owner == null || ids == null) {
    return;
  }

  if (op === "remove") {
    ids.splice(index, 1);
  } else {
    while (ids.length < index) {
      ids.push(`mock-${name}-${ids.length}`);
    }

    ids.splice(index, 0, id ?? newMockId());
  }

  owner.properties[name] = ids.flatMap((item) => ["id", item]);
}

/**
 * Drop one clip slot from every track's slot list, as a scene is removed.
 * @param reg - The registry
 * @param index - The scene's index
 */
function dropSlotIds(reg: MockRegistryAccess, index: number): void {
  for (const { path } of reg.all()) {
    if (/^live_set tracks \d+$/.test(path)) {
      editChildList(reg, path, "clip_slots", index, "remove");
    }
  }
}

/**
 * Remove the clip slots a deleted scene took with it, and what's in them.
 * @param reg - The registry
 * @param index - The scene's index
 * @param remove - Marks one object deleted
 */
function removeSlotsAt(
  reg: MockRegistryAccess,
  index: number,
  remove: (mock: RegisteredMockObject) => void,
): void {
  for (const mock of reg.all()) {
    if (SLOT_PATH.exec(mock.path)?.[2] === String(index)) {
      remove(mock);
    }
  }
}
