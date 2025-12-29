import { ALL_VALID_DEVICES } from "../../constants.js";

function validateDeviceName(deviceName) {
  if (!ALL_VALID_DEVICES.includes(deviceName)) {
    throw new Error(
      `createInstrumentRack failed: invalid deviceName "${deviceName}". Valid devices - ${ALL_VALID_DEVICES.join(", ")}`,
    );
  }
}

export function normalizeMacroCount(targetCount) {
  if (targetCount == null) {
    return null;
  }

  const clamped = Math.max(0, Math.min(16, targetCount));

  if (clamped % 2 !== 0) {
    return Math.min(clamped + 1, 16);
  }

  return clamped;
}

export function ensureMacroCount(device, targetCount) {
  const normalized = normalizeMacroCount(targetCount);

  if (normalized == null) {
    return;
  }

  const currentCount = device.getProperty("visible_macro_count") ?? 0;
  const diff = normalized - currentCount;
  const pairCount = Math.abs(diff) / 2;

  if (diff > 0) {
    for (let i = 0; i < pairCount; i++) {
      device.call("add_macro");
    }
  } else if (diff < 0) {
    for (let i = 0; i < pairCount; i++) {
      device.call("remove_macro");
    }
  }
}

function extractLiveApiId(result) {
  if (!result) {
    return null;
  }

  if (Array.isArray(result)) {
    if (result.length === 2 && result[0] === "id") {
      return result[1];
    }

    if (result.length >= 2 && typeof result[1] === "string") {
      return result[1];
    }
  }

  return result;
}

export function insertDevice(container, deviceName, deviceIndex) {
  validateDeviceName(deviceName);

  const result =
    deviceIndex != null
      ? container.call("insert_device", deviceName, deviceIndex)
      : container.call("insert_device", deviceName);

  const deviceId = extractLiveApiId(result);

  if (deviceId == null) {
    throw new Error(
      `createInstrumentRack failed: Live API did not return an id when inserting "${deviceName}"`,
    );
  }

  const device = LiveAPI.from(deviceId);

  if (!device || !device.exists()) {
    throw new Error(
      `createInstrumentRack failed: could not insert device "${deviceName}"`,
    );
  }

  return device;
}

export function createRackChain(rack, name) {
  let createChainError;

  try {
    const created = rack.call("create_chain");
    const chainId = extractLiveApiId(created);
    const chain = LiveAPI.from(chainId);

    if (!chain || !chain.exists()) {
      throw new Error("created chain does not exist");
    }

    if (name) {
      chain.set("name", name);
    }

    return chain;
  } catch (error) {
    createChainError = error;
  }

  try {
    const placeholder = insertDevice(rack, "Instrument Rack");
    const chains = rack.getChildren("chains");
    const chain = chains[chains.length - 1];

    if (!chain || !chain.exists()) {
      throw new Error("insert_device did not create a chain");
    }

    const deviceIds = chain.getChildIds("devices");
    const placeholderIndex = deviceIds.findIndex(
      (id) => id === placeholder.id || id === `id ${placeholder.id}`,
    );

    if (placeholderIndex >= 0) {
      chain.call("delete_device", placeholderIndex);
    }

    if (name) {
      chain.set("name", name);
    }

    return chain;
  } catch (insertError) {
    throw new Error(
      `createInstrumentRack failed: could not create rack chain (${createChainError?.message ?? createChainError}; ${insertError.message})`,
    );
  }
}

function buildSublayer(nestedRack, sublayer, index) {
  const subchain = createRackChain(nestedRack, sublayer?.name ?? `Sublayer ${index + 1}`);
  const instrumentName = sublayer?.instrument ?? sublayer?.deviceName ?? "Operator";
  const instrument = insertDevice(subchain, instrumentName);
  const effects = (sublayer?.effects ?? []).map((effectName) =>
    insertDevice(subchain, effectName),
  );

  return {
    chainId: subchain.id,
    instrument: instrumentName,
    effectIds: effects.map((effect) => effect.id),
  };
}

function buildLayer(rack, layer, index) {
  const chain = createRackChain(rack, layer?.name ?? `Layer ${index + 1}`);

  if (Array.isArray(layer?.sublayers) && layer.sublayers.length > 0) {
    const nestedRack = insertDevice(chain, "Instrument Rack");
    ensureMacroCount(nestedRack, layer.macroCount ?? layer.macros?.length);
    const nestedChains = layer.sublayers.map((sublayer, subIndex) =>
      buildSublayer(nestedRack, sublayer, subIndex),
    );
    const effects = (layer?.effects ?? []).map((effectName) =>
      insertDevice(chain, effectName),
    );

    return {
      chainId: chain.id,
      nestedRackId: nestedRack.id,
      nestedChains,
      effectIds: effects.map((effect) => effect.id),
    };
  }

  const instrumentName = layer?.instrument ?? layer?.deviceName ?? "Operator";
  const instrument = insertDevice(chain, instrumentName);
  const effects = (layer?.effects ?? []).map((effectName) => insertDevice(chain, effectName));

  return {
    chainId: chain.id,
    instrument: instrumentName,
    effectIds: effects.map((effect) => effect.id),
  };
}

export function buildInstrumentRack({
  container,
  layers,
  macroCount,
  rackDeviceIndex = 0,
  rackName,
}) {
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error("createInstrumentRack failed: at least one layer is required");
  }

  const rack = insertDevice(container, "Instrument Rack", rackDeviceIndex);

  if (rackName) {
    rack.set("name", rackName);
  }

  ensureMacroCount(rack, macroCount);
  const chains = layers.map((layer, index) => buildLayer(rack, layer, index));

  return { rack, rackId: rack.id, chains };
}

export function insertEffects(container, effectNames, startIndex) {
  return (effectNames ?? []).map((effectName, index) =>
    insertDevice(container, effectName, startIndex == null ? undefined : startIndex + index),
  );
}
