import * as console from "#src/shared/v8-max-console.js";
import { buildInstrumentRack, insertEffects } from "./instrument-rack-builder.js";

function resolveTrack(trackCategory = "regular", trackIndex) {
  if (trackCategory === "master") {
    if (trackIndex != null) {
      console.error("createInstrumentRack: trackIndex is ignored for master track");
    }

    const track = new LiveAPI("live_set master_track");

    if (!track.exists()) {
      throw new Error("createInstrumentRack failed: master track does not exist");
    }

    return track;
  }

  if (trackIndex == null) {
    throw new Error(
      `createInstrumentRack failed: trackIndex is required for ${trackCategory} tracks`,
    );
  }

  const trackPath =
    trackCategory === "return"
      ? `live_set return_tracks ${trackIndex}`
      : `live_set tracks ${trackIndex}`;
  const track = new LiveAPI(trackPath);

  if (!track.exists()) {
    throw new Error(
      `createInstrumentRack failed: ${trackCategory} track ${trackIndex} does not exist`,
    );
  }

  return track;
}

function findDeviceIndex(container, deviceId) {
  const ids = container.getChildIds("devices");
  const target = String(deviceId);

  const matches = (entry) => {
    const value = String(entry);

    return value === target || value === `id ${target}` || `id ${value}` === target;
  };

  return ids.findIndex(matches);
}

export function createInstrumentRack(
  {
    trackCategory = "regular",
    trackIndex,
    deviceIndex,
    layers = [],
    macroCount,
    rackName,
    masterEffects = [],
  } = {},
  _context = {},
) {
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error("createInstrumentRack failed: at least one layer is required");
  }

  const track = resolveTrack(trackCategory, trackIndex);

  const { rack, chains } = buildInstrumentRack({
    container: track,
    layers,
    macroCount,
    rackDeviceIndex: deviceIndex ?? 0,
    rackName,
  });

  const rackIndex = findDeviceIndex(track, rack.id);
  const masterEffectDevices = insertEffects(
    track,
    masterEffects,
    rackIndex >= 0 ? rackIndex + 1 : undefined,
  );

  return {
    rackId: rack.id,
    deviceIndex: rackIndex >= 0 ? rackIndex : undefined,
    chains,
    masterEffects: masterEffectDevices.map((device, index) => ({
      id: device.id,
      name: masterEffects[index],
    })),
  };
}
