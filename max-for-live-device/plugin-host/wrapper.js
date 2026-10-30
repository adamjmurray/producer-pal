// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Embedded in the plug-in host device's v8.codebox. Answers Producer Pal's
// requests about the plug-in hosted by this device's vst~.
//
// In:  request <id> <json>   on the shared "ppal-plugin-host-req" channel
//      pname <names...>      vst~ parameter names (params)
//      pval <index> <value> <display>   vst~ get/changed output (valuemode 2)
//      slot <n> <value>      automation dial n (0-1), forwarded to its param
// Out: messages to vst~
//
// The plug-in's state lives in two pattrs: "vstmirror" is bound to vst~ and
// reads its state; "vststate" is a stored-only blob parameter that Live saves
// with the Set and restores into vst~ through vstmirror at load. "vstname" is
// another such blob, holding the plug-in's name, and "vstslots" one holding
// which plug-in param each automation dial drives.
// Replies go to "ppal-plugin-host-res" as: plugin_host_response <id> <json>

autowatch = 0;
inlets = 1;
outlets = 1;

const REPLY_CHANNEL = "ppal-plugin-host-res";

const state = {
  plugin: null,
  names: [],
  info: {},
  values: {},
};

function request(id, json) {
  let req;

  try {
    req = JSON.parse(json);
  } catch {
    return;
  }

  // Every host hears every request; only the addressed device answers.
  if (String(req.deviceId) !== ownDeviceId()) return;

  busy++;

  let deferred = false;

  try {
    const before = WRITE_OPS.has(req.op) ? readState() : null;
    const result = handle(req);

    if (req.op === "load") {
      // A freshly loaded plug-in's state keeps changing for a moment; saving
      // it now would leave a second write behind, outside this call's undo step.
      deferred = true;
      settleThenFinish(id, result);
    } else if (before != null) {
      deferred = true;
      changeThenFinish(id, result, before);
    } else {
      finish(id, result, isRead(req, result) ? "read" : "request");
    }
  } catch (error) {
    deferred = false;
    reply(id, { success: false, error: String(error?.message ?? error) });
  } finally {
    if (!deferred) busy--;
  }
}

// Inside the request, so the tool call's own undo step covers the write.
// A failed write must not fail the request: say so in the reply instead.
function finish(id, result, why = "request") {
  const stateError = saveState(why);

  reply(id, {
    success: true,
    ...result,
    ...(stateError ? { stateError } : {}),
  });
}

// Wait until two reads of the plug-in's state, SETTLE_INTERVAL_MS apart, agree
// (at most SETTLE_MAX_MS), then save and reply. The reply is late but well
// inside the load timeout. busy stays up until then.
const SETTLE_INTERVAL_MS = 250;
const SETTLE_MAX_MS = 3000;

function settleThenFinish(id, result) {
  const started = Date.now();
  let previous = readState();

  finishWhen(SETTLE_INTERVAL_MS, id, result, () => {
    const current = readState();

    if (current !== previous && Date.now() - started < SETTLE_MAX_MS) {
      previous = current;

      return false;
    }

    return true;
  });
}

// Ops that change nothing, so they don't save a state that only slots moved.
const READ_OPS = new Set(["info", "params", "slots"]);

function isRead(req, result) {
  return READ_OPS.has(req.op) || result.unchanged === true;
}

// A plug-in applies a written value a few ms after the request, so its state
// changes only then. Saving before that leaves the write to the 2 s poll, and
// a duplicate or Set save right after the call loses it. So wait for the
// change, at most CHANGE_MAX_MS (a write that changes nothing waits that long).
const WRITE_OPS = new Set(["set", "write"]);
const CHANGE_INTERVAL_MS = 5;
const CHANGE_MAX_MS = 100;

function changeThenFinish(id, result, before) {
  const started = Date.now();

  finishWhen(
    CHANGE_INTERVAL_MS,
    id,
    result,
    () => readState() !== before || Date.now() - started >= CHANGE_MAX_MS,
  );
}

// Every intervalMs, ask done(); once it says yes, save and reply. busy stays
// up until then.
function finishWhen(intervalMs, id, result, done) {
  const task = new Task(function () {
    if (!done()) return;

    task.cancel();

    try {
      finish(id, result);
    } catch (error) {
      reply(id, { success: false, error: String(error?.message ?? error) });
    } finally {
      busy--;
    }
  });

  task.interval = intervalMs;
  task.repeat();
}

function readState() {
  try {
    return stateOf();
  } catch {
    return null;
  }
}

function pname(...names) {
  for (const name of names) state.names.push(String(name));
}

function pval(index, value, ...display) {
  if (index < 0) {
    state.info[index] = [value, ...display];

    return;
  }

  state.values[index] = { value, display: display.join(" ") };

  // A change we didn't ask for: an edit in the plug-in's own window. Our own
  // writes, slots included, echo back synchronously while busy is up.
  if (busy > 0) return;
  // MIDI from Live (All Notes Off on start and stop) lands on the stand-ins.
  if (isStandIn(index)) return;

  markEdited();
}

function handle(req) {
  switch (req.op) {
    case "info":
      return info();
    case "load":
      return load(req);
    case "params":
      return readParams(req);
    case "set":
      return { params: setParams(req.params ?? []) };
    case "write":
      return { params: writeParams(req.params ?? []) };
    case "raw":
      return raw(req.message ?? []);
    case "map":
      return mapSlot(req);
    case "unmap":
      return unmapSlot(req);
    case "slots":
      return listSlots();
    default:
      throw new Error(`unknown op: ${req.op}`);
  }
}

// vst~ loads by bundle file name. Neither step fails loudly: a bad bundle name
// leaves the old plug-in (or the AU of that name) loaded, and a bad subname
// keeps the bundle's first plug-in. So check what actually loaded.
// "sub" picks a plug-in inside a bundle that holds several; it is sent only
// then, because bundles without a moduleinfo.json can't be searched by
// subname. "name" is the plug-in's name, for messages.
function load({ file, sub, name, synth }) {
  if (!file) throw new Error("load needs file");

  const label = String(name ?? sub ?? file);

  state.plugin = null;
  state.names = [];
  state.info = {};
  outlet(0, "unplug");
  outlet(0, "plug_vst3", String(file));
  if (sub) outlet(0, "subname", String(sub));

  const result = info();
  const problem = loadProblem(String(file), !!sub, label, !!synth, result);

  if (problem) {
    outlet(0, "unplug");
    state.names = [];
    state.info = {};
    throw new Error(problem);
  }

  state.plugin = label;
  nameDevice(label);
  saveName(label);
  // A mapping stored before this load was for another plug-in, so there is
  // nothing left to wait for.
  slotsReady = true;
  slotCache = null;
  readSlots();

  return { ...result, plugin: state.plugin };
}

// A good load reads "C74_VST3:/<bundle> <numeric id>". With a subname, the id
// is missing when subname found nothing. Without one, a bundle may read with
// or without the id.
function loadProblem(file, picked, label, synth, result) {
  const loaded = result.loaded;
  const prefix = `C74_VST3:/${file}`;
  const fail = (why) => `could not load "${label}": ${why}`;

  if (!loaded) return fail(`nothing loaded from "${file}"`);
  if (!loaded.startsWith(prefix)) {
    return fail(`loaded ${loaded} instead of VST3 "${file}"`);
  }

  const rest = loaded.slice(prefix.length);

  if (rest !== "" && !/^ -?\d+$/.test(rest)) {
    return fail(`loaded ${loaded} instead of VST3 "${file}"`);
  }
  if (picked && rest === "") {
    return fail(
      `the VST3 bundle "${file}" loaded its first plug-in (${loaded}) instead`,
    );
  }
  if (result.numParams == null) return fail("no parameters");
  if (result.isSynth !== synth) {
    const kind = (isSynth) => (isSynth ? "an instrument" : "an audio effect");

    return fail(`it loaded as ${kind(result.isSynth)}, not ${kind(synth)}`);
  }

  return null;
}

function info() {
  for (const i of [-1, -2, -4, -7, -10]) outlet(0, "get", i);

  const num = (i) => (state.info[i] == null ? null : Number(state.info[i][0]));

  return {
    plugin: state.plugin ?? storedName() ?? loadedPlugin(),
    loaded: loadedPlugin(),
    numParams: num(-4),
    numInputs: num(-1),
    numOutputs: num(-2),
    isSynth: num(-7) === 1,
    latency: num(-10),
  };
}

// Debug: send vst~ any message; numeric atoms go as numbers.
function raw(message) {
  const atoms = message.map((a) => (a !== "" && !isNaN(a) ? Number(a) : a));

  outlet(0, ...atoms);

  return { sent: atoms };
}

// Live compensates for the latency a device declares, and a patch declares
// it in its "latency" attribute. The hosted plug-in's latency can change any
// time (and the attribute resets on reload), so keep them in step.
const LATENCY_POLL_MS = 1000;
const latencyTask = new Task(syncLatency);

latencyTask.interval = LATENCY_POLL_MS;
latencyTask.repeat();

function syncLatency() {
  busy++;

  try {
    delete state.info[-10];
    outlet(0, "get", -10);

    const samples = Number(state.info[-10]?.[0] ?? 0);

    if (samples !== Number(this.patcher.getattr("latency"))) {
      this.patcher.setattr("latency", samples);
    }
  } finally {
    busy--;
  }
}

function loadNames() {
  state.names = [];
  outlet(0, "params");
}

// VST3 plug-ins expose a stand-in param per MIDI CC, pitch bend and
// aftertouch, usually per channel: one unbroken block of 132 or 2080 near the
// end. Vendors name them differently ("CC 1, CH 4", "MIDI CC 0|0", "CC107
// Chan 16", "MIDI CC"), and real params can say "Pitch Bend" too, so hide the
// longest run of MIDI-looking names, and only when it's that long.
const MIDI_NAME =
  /MIDI ?CC|^CC ?\d|Pitch ?Bend|Aftertouch|Channel ?Pressure|Chan(nel)? ?\d/i;
const MIN_STAND_IN_RUN = 128;

let standIn = null; // {count, range} for the names it was computed from

function isStandIn(index) {
  if (state.names.length === 0) loadNames();
  if (standIn?.count !== state.names.length) {
    standIn = { count: state.names.length, range: standInRange(state.names) };
  }

  return index - 1 >= standIn.range[0] && index - 1 < standIn.range[1];
}

function standInRange(names) {
  let best = [0, 0];

  for (let i = 0; i < names.length; ) {
    if (!MIDI_NAME.test(names[i])) {
      i++;
      continue;
    }

    let j = i;

    while (j < names.length && MIDI_NAME.test(names[j])) j++;
    if (j - i > best[1] - best[0]) best = [i, j];
    i = j;
  }

  return best[1] - best[0] >= MIN_STAND_IN_RUN ? best : [0, 0];
}

const DEFAULT_LIMIT = 100;

function readParams({ names, search, offset = 0, limit = DEFAULT_LIMIT }) {
  loadNames();

  const wanted = names?.length ? new Set(names.map(String)) : null;
  // Debug: "*" lists everything, stand-ins included.
  const all = search === "*";
  const needle = all ? null : search?.toLowerCase();
  const matches = [];

  const [hideFrom, hideTo] = standInRange(state.names);
  const isStandIn = (i) => i >= hideFrom && i < hideTo;

  state.names.forEach((name, i) => {
    if (wanted ? wanted.has(name) : all || !isStandIn(i)) {
      if (!needle || name.toLowerCase().includes(needle)) matches.push(i + 1);
    }
  });

  const page = wanted ? matches : matches.slice(offset, offset + limit);

  return {
    total: matches.length,
    params: page.map((index) => readParam(index)),
  };
}

function readParam(index, name) {
  delete state.values[index];
  outlet(0, "get", index);

  const read = state.values[index] ?? {};

  return {
    index,
    name: name ?? state.names[index - 1],
    value: read.value,
    display: read.display,
  };
}

// --- Saving the plug-in's state in the Set ---
// vstmirror.getvalueof() returns the plug-in's current state as a dict (a
// C74Snapshot: plug-in id plus the plug-in's own state chunk). We copy it into
// vststate only when it changed, since each write is a Live undo step and Live
// saves whatever vststate holds. vst~ has parameter_enable and autosave off:
// with them on, every value sent to vst~ is its own undo step.
// Writes happen:
//   - at the end of each request (above)
//   - EDIT_DEBOUNCE_MS after the last edit in the plug-in's window
//   - when playback stops, if edits are still pending
//   - when the poll below sees the state changed (program changes, wavetables
//     and other edits that send no parameter change)
// Exception: a read request or the poll that finds the state changed only
// because slots wrote since the last save adopts it without writing, so
// automation adds no undo steps. The cost: an edit in the plug-in window or a
// program change made while slots move is saved only by the next real save.
// Nonzero while this script is talking to vst~, so its echoes aren't edits.
let busy = 0;
const EDIT_DEBOUNCE_MS = 300;
const POLL_MS = 2000;
let savedAt = 0; // when lastSaved was last written or adopted
let lastSaved = null; // the state string we last wrote or found stored
let edited = false;
const editTask = new Task(flushEdit);
const initTask = new Task(adoptStored);
const pollTask = new Task(pollState);
let playing = false;
let transport = null;

pollTask.interval = POLL_MS;
pollTask.repeat();

// Once the restore has run: if a state is stored, the plug-in matches it, so
// the first poll doesn't write it back. (The two strings can differ in key
// order even when the state is the same.)
initTask.schedule(1500);

function adoptStored() {
  if (lastSaved == null && storedState() != null) lastSaved = stateOf();

  slotsReady = true;
  slotCache = null;
  sendDialValues();
}

function stateOf() {
  return this.patcher.getnamed("vstmirror").getvalueof().stringify();
}

function storedState() {
  const stored = this.patcher.getnamed("vststate").getvalueof();

  // Nothing stored yet: pattr answers with a number, not a dict.
  return stored != null && typeof stored.stringify === "function"
    ? stored.stringify()
    : null;
}

// Copy the plug-in's state into the blob if it changed. Returns an error
// message or null; never throws.
function saveState(why) {
  try {
    // A wrapper with no plug-in has nothing to store; don't write an empty one.
    if (lastSaved == null && !loadedPlugin()) return null;

    const current = stateOf();

    if (lastSaved == null) lastSaved = storedState();
    if (current === lastSaved) return null;

    // Slots wrote since the last save and nothing else changed the plug-in:
    // take the new state as saved without writing it, so automation never adds
    // undo steps. (A program change made while slots move is missed too.)
    if ((why === "read" || why === "poll") && slotWriteAt > savedAt) {
      lastSaved = current;
      savedAt = Date.now();

      return null;
    }

    // Live restored an older or newer stored state (undo, redo): the blob
    // already holds it, and writing again would drop the redo.
    if (current === storedState()) {
      lastSaved = current;

      return null;
    }

    const dict = this.patcher.getnamed("vstmirror").getvalueof();

    this.patcher.getnamed("vststate").message("dictionary", dict.name);
    lastSaved = current;
    savedAt = Date.now();
    edited = false;
    editTask.cancel();

    return null;
  } catch (error) {
    post(`ppal-plugin-host: could not save state: ${error}\n`);

    return `could not save the plug-in state: ${error?.message ?? error}`;
  }
}

function markEdited() {
  edited = true;
  editTask.cancel();
  editTask.schedule(EDIT_DEBOUNCE_MS);
}

function flushEdit() {
  if (edited) saveState("edit");
}

// Skipped during requests (they save themselves) and while edits are pending.
// Also skipped while automation is writing slots: a state change made only by
// slot writes would otherwise be saved (one undo step) every poll for as long
// as the automation moves. The poll after the last slot write catches up.
function pollState() {
  if (slotsReady) readSlots();
  if (busy > 0 || edited) return;
  if (Date.now() - slotWriteAt < POLL_MS) return;

  saveState("poll");
}

function onTransport(args) {
  if (args[0] !== "is_playing") return;

  const wasPlaying = playing;

  playing = Number(args[1]) === 1;
  if (wasPlaying && !playing && edited) saveState("stop");
}

// Live's transport. Observed after load: LiveAPI isn't usable before then.
const watchTask = new Task(function () {
  try {
    transport = new LiveAPI(onTransport, "live_set");
    transport.property = "is_playing";
  } catch (error) {
    post(`ppal-plugin-host: could not watch playback: ${error}\n`);
  }
});

watchTask.schedule(1000);

// --- Automation slots ---
// SLOT_COUNT live.dials are the parameters Live can automate. Each can drive
// one plug-in param; the mapping is saved in the "vstslots" blob as JSON
// {"<slot>": {index, name, file}}. Live reads a dial's name once at load, so
// the names are fixed and the mapping is ours. The names are zero-padded so
// Live lists them in order. Entries for another plug-in file are ignored.
const SLOT_COUNT = 128; // npm run plugin-host:build sets this
const NAME_WIDTH = Math.max(2, String(SLOT_COUNT).length);
const SLOTS_REFRESH_MS = 500;
let slotsReady = false; // the stored mapping is readable, or a plug-in was loaded
let slotCache = null; // {at, map}: re-read at most every SLOTS_REFRESH_MS
let slotShown = null; // the list text last put in the display
let slotWriteAt = 0; // when a slot last wrote to vst~

// vst~ echoes a write synchronously, so busy tells it from a window edit.
function slot(n, value) {
  if (!slotsReady) return;

  const entry = readSlots()[n];

  if (entry == null || !isFinite(value)) return;

  slotWriteAt = Date.now();
  busy++;

  try {
    outlet(0, entry.index, Number(value));
  } finally {
    busy--;
  }
}

// After a load, the plug-in gets the dials' restored values.
function sendDialValues() {
  for (const n of Object.keys(readSlots())) slot(Number(n), dialValue(n));
}

function dialValue(n) {
  const value = this.patcher.getnamed(`slotdial${n}`)?.getvalueof();

  return Number(Array.isArray(value) ? value[0] : value);
}

function setDial(n, value) {
  if (!isFinite(value)) return;

  this.patcher.getnamed(`slotdial${n}`)?.message("set", Number(value));
}

function dialName(n) {
  return `Automation ${String(n).padStart(NAME_WIDTH, "0")}`;
}

// Setting a dial would override its automation, so map checks first.
function dialHasAutomation(n) {
  const name = dialName(n);
  const count = new LiveAPI("this_device").getcount("parameters");

  for (let i = 0; i < count; i++) {
    const param = new LiveAPI(`this_device parameters ${i}`);

    if (String(param.get("name")) === name) {
      return Number(param.get("automation_state")) !== 0;
    }
  }

  return false;
}

function slotNumber(slot) {
  const n = Number(slot);

  if (!Number.isInteger(n) || n < 1 || n > SLOT_COUNT) {
    throw new Error(`slot must be 1-${SLOT_COUNT}`);
  }

  return String(n);
}

// The slot's dial is set to the param's value, unless the slot already drives
// this param or the dial has arrangement automation.
function mapSlot({ slot: slotArg, name, index }) {
  if (!slotsReady) throw new Error("the device is still loading");

  const n = slotNumber(slotArg);
  const file = loadedFile();

  if (file == null) throw new Error("no plug-in loaded");
  if (state.names.length === 0) loadNames();

  const target = resolveEntry(index != null ? { index } : { name });

  if (target.error) throw new Error(target.error);

  const map = { ...readSlots() };
  const old = map[n];

  if (old?.index === target.index) {
    return { ...slotEntry(n, old), dialSet: false, unchanged: true };
  }

  const read = readParam(target.index);
  const dialSet = !dialHasAutomation(n);

  map[n] = { index: target.index, name: read.name, file };
  if (dialSet) setDial(n, read.value);
  saveSlots(map);

  return { ...slotEntry(n, map[n]), dialSet };
}

function unmapSlot({ slot: slotArg }) {
  if (!slotsReady) throw new Error("the device is still loading");

  const n = slotNumber(slotArg);
  const map = { ...readSlots() };
  const old = map[n];

  delete map[n];
  saveSlots(map);

  return { slot: Number(n), unmapped: old != null };
}

function listSlots() {
  const map = readSlots();

  return {
    slotCount: SLOT_COUNT,
    slots: sortedSlots(map).map((n) => slotEntry(n, map[n])),
  };
}

function slotEntry(n, entry) {
  return { slot: Number(n), index: entry.index, name: entry.name };
}

function sortedSlots(map) {
  return Object.keys(map).sort((a, b) => Number(a) - Number(b));
}

// The mapping for the plug-in that is loaded now, cached briefly because
// automation asks for it on every value.
function readSlots() {
  const now = Date.now();

  if (slotCache != null && now - slotCache.at < SLOTS_REFRESH_MS) {
    return slotCache.map;
  }

  slotCache = { at: now, map: storedSlots() };
  showSlots(slotCache.map);

  return slotCache.map;
}

function storedSlots() {
  try {
    const stored = this.patcher.getnamed("vstslots")?.getvalueof();

    // Nothing stored yet: pattr answers with a number, not a dict.
    if (stored == null || typeof stored.get !== "function") return {};

    const all = JSON.parse(String(stored.get("json") ?? "{}"));
    const file = loadedFile();
    const map = {};

    for (const n of Object.keys(all)) {
      if (all[n]?.file != null && all[n].file === file) map[n] = all[n];
    }

    return map;
  } catch (error) {
    post(`ppal-plugin-host: could not read the slots: ${error}\n`);

    return {};
  }
}

// Saves what readSlots returned, so entries for another plug-in file go.
function saveSlots(map) {
  const dict = new Dict();

  dict.set("json", JSON.stringify(map));
  this.patcher.getnamed("vstslots").message("dictionary", dict.name);
  slotCache = { at: Date.now(), map };
  showSlots(map);
}

function showSlots(map) {
  const names = sortedSlots(map).map((n) => `${n}: ${map[n].name}`);
  const text = names.length
    ? `Automation slots: ${names.join("   ")}`
    : "No automation slots mapped";

  if (text === slotShown) return;

  slotShown = text;
  this.patcher.getnamed("slotlist")?.message("set", text);
}

function setParams(changes) {
  if (state.names.length === 0) loadNames();

  const results = changes.map((change) => {
    const index =
      change.index != null
        ? Number(change.index)
        : state.names.indexOf(String(change.name)) + 1;

    if (index < 1 || index > state.names.length) {
      throw new Error(`no param ${change.name ?? change.index}`);
    }

    outlet(0, index, Number(change.value));

    return readParam(index);
  });

  return results;
}

// Set params to what they should display, e.g. "-6 dB" or "1/16". vst~ can
// turn a 0-1 value into text only by setting it, so each param is searched:
// sample the range, take the value whose text matches, else bisect on the
// number it shows. A param nothing matches goes back to where it was.
// Entry: {index | name, text?, number?}. Result per entry:
// {ok, index, name, value, display}
// | {ok: false, kind: "missing" | "ambiguous" | "nomatch", error, matches?}
// | {superseded: <position of the entry that replaces it>, index, name}.
const SAMPLES = 128;
const BISECT_STEPS = 30;
const HINT_TEXTS = 8;

function writeParams(entries) {
  if (state.names.length === 0) loadNames();

  const targets = entries.map((entry) => resolveEntry(entry));
  const results = targets.map((target, i) => {
    if (target.error) return failure(target);

    const last = lastOf(targets, target.index);

    if (last !== i) return { superseded: last, ...identity(target) };

    return writeOne(target, entries[i]);
  });

  return results;
}

function lastOf(targets, index) {
  return targets.map((target) => target.index).lastIndexOf(index);
}

function identity(target) {
  return { index: target.index, name: state.names[target.index - 1] };
}

function failure(target) {
  return {
    ok: false,
    kind: target.kind,
    error: target.error,
    ...(target.matches ? { matches: target.matches } : {}),
  };
}

// An index is the plug-in's own param number; a name matches exactly first,
// then ignoring case and padding.
function resolveEntry(entry) {
  const count = state.names.length;

  if (entry.index != null) {
    const index = Number(entry.index);

    return index >= 1 && index <= count
      ? { index }
      : { kind: "missing", error: `no param ${entry.index}` };
  }

  const name = String(entry.name ?? "");
  const exact = indexesOf((n) => n === name);
  const loose = () => {
    const wanted = name.trim().toLowerCase();

    return indexesOf((n) => n.trim().toLowerCase() === wanted);
  };
  const found = exact.length > 0 ? exact : loose();

  if (found.length === 1) return { index: found[0] };
  if (found.length > 1) {
    const matches = found.map((index) => identity({ index }));

    return { kind: "ambiguous", error: "more than one param has that name", matches };
  }

  return { kind: "missing", error: "no param with that name" };
}

function indexesOf(test) {
  const found = [];

  state.names.forEach((name, i) => {
    if (test(name)) found.push(i + 1);
  });

  return found;
}

function writeOne(target, entry) {
  const { index } = target;
  const original = readParam(index);
  const found = searchValue(index, entry);

  if (found.error) {
    outlet(0, index, Number(original.value));

    return { ok: false, kind: "nomatch", error: found.error };
  }

  outlet(0, index, found.value);

  const landed = readParam(index);

  return {
    ok: true,
    ...identity(target),
    value: landed.value,
    display: landed.display,
  };
}

// Where in 0-1 does the param show this text or number?
function searchValue(index, { text, number }) {
  const samples = [];

  for (let i = 0; i <= SAMPLES; i++) {
    const value = i / SAMPLES;

    outlet(0, index, value);
    samples.push({ value, display: String(readParam(index).display ?? "") });
  }

  const wanted = text == null ? null : looseText(text);
  const hit = wanted && samples.find((s) => matchesText(s.display, wanted));

  if (hit) return { value: hit.value };
  if (number == null) return { error: noMatch(samples, text) };

  const found = bisect(index, samples, Number(number));

  return found ?? { error: noMatch(samples, text ?? String(number)) };
}

function looseText(text) {
  return String(text).replace(/\s+/g, "").toLowerCase();
}

// The whole text, or a part of it that stands alone ("[-17.9dB]").
function matchesText(display, wanted) {
  const shown = looseText(display);

  return shown === wanted || shown.includes(`[${wanted}]`);
}

// The number a display starts with, in the units Producer Pal compares in:
// Hz (kHz scaled) and ms (s scaled). Null for a display that isn't a number.
function displayNumber(display) {
  const match = /^\s*([-+]?(?:\d+\.?\d*|\.\d+))\s*(\S*)/.exec(display);

  if (!match) return null;

  const unit = match[2];
  const scale = /^k(hz)?$/i.test(unit) ? 1000 : unit === "s" ? 1000 : 1;

  return Number(match[1]) * scale;
}

function bisect(index, samples, target) {
  const shown = samples.map((s) => displayNumber(s.display));
  const numeric = shown.filter((n) => n != null);

  if (numeric.length < 2) return null;

  // The first neighbouring pair that brackets the target; past either end, the
  // closest sample.
  let pair = -1;

  for (let i = 0; i < samples.length - 1; i++) {
    const a = shown[i];
    const b = shown[i + 1];

    if (a != null && b != null && Math.min(a, b) <= target && target <= Math.max(a, b)) {
      pair = i;
      break;
    }
  }

  let best = closest(samples, shown, target);

  if (pair < 0) return { value: best.value };

  let lo = samples[pair].value;
  let hi = samples[pair + 1].value;
  const loIsLow = shown[pair] <= shown[pair + 1];

  for (let step = 0; step < BISECT_STEPS && best.diff > 0; step++) {
    const mid = (lo + hi) / 2;

    outlet(0, index, mid);

    const n = displayNumber(String(readParam(index).display ?? ""));

    if (n == null) break;

    const diff = Math.abs(n - target);

    if (diff < best.diff) best = { value: mid, diff };
    if ((n < target) === loIsLow) lo = mid;
    else hi = mid;
  }

  return { value: best.value };
}

function closest(samples, shown, target) {
  let best = { value: samples[0].value, diff: Infinity };

  shown.forEach((n, i) => {
    if (n != null && Math.abs(n - target) < best.diff) {
      best = { value: samples[i].value, diff: Math.abs(n - target) };
    }
  });

  return best;
}

// Say what the param does show, so the next try can use it.
function noMatch(samples, wanted) {
  const seen = [];

  for (const { display } of samples) {
    const text = display.trim();

    if (text && !seen.includes(text)) seen.push(text);
    if (seen.length >= HINT_TEXTS) break;
  }

  return `nothing displays as "${wanted}"; it shows values like ${seen.join(", ")}`;
}

// vst~ restores the plug-in after a Set reload or duplicate, but not its name.
// The device is named after the plug-in when it loads, and the Set keeps that.
// The name counts as the plug-in's only while it still fits the file vst~
// reports, so a name the user typed over it doesn't pass for the plug-in.
function nameDevice(label) {
  new LiveAPI("this_device").set("name", label);
}

// After a reload, vst~ knows only the file, so the name loaded with it is
// saved with the Set. The device name can't hold it: it may be renamed.
function saveName(name) {
  try {
    const dict = new Dict();

    dict.set("name", name);
    dict.set("file", loadedFile());
    this.patcher.getnamed("vstname").message("dictionary", dict.name);
  } catch (error) {
    post(`ppal-plugin-host: could not save the plug-in name: ${error}\n`);
  }
}

// Trusted only for the file it was saved with.
function storedName() {
  const stored = this.patcher.getnamed("vstname")?.getvalueof();

  // Nothing stored yet: pattr answers with a number, not a dict.
  if (stored == null || typeof stored.get !== "function") return null;

  const name = stored.get("name");

  return name && stored.get("file") === loadedFile() ? String(name) : null;
}

function loadedFile() {
  return /^C74_\w+:\/(.*?)( -?\d+)?$/.exec(loadedPlugin() ?? "")?.[1] ?? null;
}

// After a Set reload or duplicate, vst~ restores the plug-in on its own.
function loadedPlugin() {
  const plug = this.patcher.getnamed("vst")?.getattr("currentplug");
  const name = Array.isArray(plug) ? plug.join(" ") : plug;

  return name ? String(name) : null;
}

function ownDeviceId() {
  return String(new LiveAPI("this_device").id);
}

// Max caps a symbol at 32,767 chars, so long replies go out in chunks.
const CHUNK_SIZE = 30000;

function reply(id, payload) {
  const json = JSON.stringify(payload);
  const chunks = [];

  for (let i = 0; i < json.length; i += CHUNK_SIZE) {
    chunks.push(json.slice(i, i + CHUNK_SIZE));
  }

  messnamed(REPLY_CHANNEL, "plugin_host_response", id, ...chunks);
}
