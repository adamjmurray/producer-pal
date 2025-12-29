import { midiNameToPitch } from "#src/notation/midi-pitch-to-name.js";
import {
  buildInstrumentRack,
  insertEffects,
} from "./instrument-rack-builder.js";

function normalizePadNote(padNote) {
  if (typeof padNote === "number") {
    if (padNote < 0 || padNote > 127) {
      throw new Error(
        `createDrumPadInstrumentRack failed: padNote must be between 0-127 (got ${padNote})`,
      );
    }

    return padNote;
  }

  const midi = midiNameToPitch(padNote);

  if (midi == null) {
    throw new Error(
      `createDrumPadInstrumentRack failed: padNote "${padNote}" is not a valid MIDI pitch name`,
    );
  }

  return midi;
}

function ensurePadChain(pad) {
  const chains = pad.getChildren("chains", { allowLooseIds: true, depth: 2 });

  if (chains.length > 0) {
    return chains[0];
  }

  let createChainError;

  try {
    const created = pad.call("create_chain");
    const chainId = created?.[1] ?? created;

    if (chainId == null) {
      throw new Error("create_chain returned no id");
    }

    const chain = LiveAPI.from(chainId);

    if (!chain || !chain.exists()) {
      throw new Error("created chain does not exist");
    }

    return chain;
  } catch (error) {
    createChainError = error;
  }

  let createInstrumentRackError;

  try {
    pad.call("create_instrument_rack");
    const chainsAfterCreateInstrumentRack = pad.getChildren("chains", {
      allowLooseIds: true,
      depth: 2,
    });
    const chain = chainsAfterCreateInstrumentRack[0];

    if (!chain || !chain.exists()) {
      throw new Error("create_instrument_rack did not create a chain");
    }

    return chain;
  } catch (instrumentRackError) {
    createInstrumentRackError = instrumentRackError;
  }

  try {
    pad.call("insert_device", "Instrument Rack");
    const chainsAfterInsert = pad.getChildren("chains", { allowLooseIds: true, depth: 2 });
    const chain = chainsAfterInsert[0];

    if (!chain || !chain.exists()) {
      throw new Error("insert_device did not create a chain");
    }

    const devices = chain.getChildIds("devices", { allowLooseIds: true, depth: 2 });

    if (devices.length > 0) {
      chain.call("delete_device", 0);
    }

    return chain;
  } catch (insertError) {
    throw new Error(
      `createDrumPadInstrumentRack failed: drum pad could not create a chain via Live API (${createChainError?.message ?? createChainError}; ${createInstrumentRackError?.message ?? createInstrumentRackError}; ${insertError.message})`,
    );
  }
}

function clearChainDevices(chain) {
  const deviceIds = chain.getChildIds("devices", { allowLooseIds: true, depth: 2 });

  for (let i = deviceIds.length - 1; i >= 0; i--) {
    chain.call("delete_device", i);
  }
}

export function createDrumPadInstrumentRack(
  {
    trackIndex,
    drumRackDeviceIndex = 0,
    padNote = "C1",
    layers = [],
    masterEffects = [],
    clearExisting = true,
    macroCount,
  } = {},
  _context = {},
) {
  if (trackIndex == null) {
    throw new Error("createDrumPadInstrumentRack failed: trackIndex is required");
  }

  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error("createDrumPadInstrumentRack failed: at least one layer is required");
  }

  const midiPadNote = normalizePadNote(padNote);
  const drumRack = new LiveAPI(`live_set tracks ${trackIndex} devices ${drumRackDeviceIndex}`);

  if (!drumRack.exists()) {
    throw new Error(
      `createDrumPadInstrumentRack failed: drum rack at track ${trackIndex} device ${drumRackDeviceIndex} does not exist`,
    );
  }

  const pad = new LiveAPI(`${drumRack.path} drum_pads ${midiPadNote}`);

  if (!pad.exists()) {
    throw new Error(
      `createDrumPadInstrumentRack failed: drum pad ${midiPadNote} could not be accessed`,
    );
  }

  const padChain = ensurePadChain(pad);

  if (clearExisting) {
    clearChainDevices(padChain);
  }

  const { rack, chains } = buildInstrumentRack({
    container: padChain,
    layers,
    macroCount,
    rackDeviceIndex: 0,
  });

  const masterEffectDevices = insertEffects(padChain, masterEffects, 1);

  return {
    rackId: rack.id,
    padNote: midiPadNote,
    chains,
    masterEffects: masterEffectDevices.map((device, index) => ({
      id: device.id,
      name: masterEffects[index],
    })),
  };
}

export function createKickLayeredRack(
  { trackIndex, drumRackDeviceIndex = 0, padNote = "C1" } = {},
  _context = {},
) {
  return createDrumPadInstrumentRack(
    {
      trackIndex,
      drumRackDeviceIndex,
      padNote,
      layers: [
        { name: "Kick Thump", instrument: "Operator", effects: ["Auto Filter"] },
        { name: "Kick Body", instrument: "Operator", effects: ["Auto Filter"] },
        { name: "Kick Click", instrument: "Operator", effects: ["Auto Filter"] },
      ],
      masterEffects: ["Compressor"],
    },
    _context,
  );
}
