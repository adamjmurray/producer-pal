// src/live-api-extensions.js
if (typeof LiveAPI !== "undefined") {
  /**
   * Create a LiveAPI instance from an ID or path, automatically handling ID prefixing
   * @param {string|number|Array} idOrPath - ID number/string, full path, or ["id", "123"] array
   * @returns {LiveAPI} New LiveAPI instance
   */
  LiveAPI.from = function (idOrPath) {
    // Handle array format ["id", "123"] from Live API calls
    if (Array.isArray(idOrPath)) {
      if (idOrPath.length === 2 && idOrPath[0] === "id") {
        return new LiveAPI(`id ${idOrPath[1]}`);
      }
      throw new Error(
        `Invalid array format for LiveAPI.from(): expected ["id", value], got [${idOrPath}]`,
      );
    }

    if (
      typeof idOrPath === "number" ||
      (typeof idOrPath === "string" && /^\d+$/.test(idOrPath))
    ) {
      return new LiveAPI(`id ${idOrPath}`);
    }
    return new LiveAPI(idOrPath);
  };
  LiveAPI.prototype.exists = function () {
    return this.id !== "id 0" && this.id != "0";
  };

  LiveAPI.prototype.getProperty = function (property) {
    switch (property) {
      case "scale_intervals":
      case "available_warp_modes":
        return this.get(property);
      default:
        return this.get(property)?.[0];
    }
  };

  LiveAPI.prototype.getChildIds = function (name) {
    const idArray = this.get(name);

    if (!Array.isArray(idArray)) return [];

    const children = [];
    for (let i = 0; i < idArray.length; i += 2) {
      if (idArray[i] === "id") {
        children.push(`id ${idArray[i + 1]}`);
      }
    }
    return children;
  };

  LiveAPI.prototype.getChildren = function (name) {
    return this.getChildIds(name).map((id) => new LiveAPI(id));
  };

  LiveAPI.prototype.getColor = function () {
    const colorValue = this.getProperty("color");
    if (colorValue === undefined) return null;

    const r = (colorValue >> 16) & 0xff;
    const g = (colorValue >> 8) & 0xff;
    const b = colorValue & 0xff;

    return (
      "#" +
      r.toString(16).padStart(2, "0").toUpperCase() +
      g.toString(16).padStart(2, "0").toUpperCase() +
      b.toString(16).padStart(2, "0").toUpperCase()
    );
  };

  LiveAPI.prototype.setColor = function (cssColor) {
    if (!cssColor.startsWith("#") || cssColor.length !== 7) {
      throw new Error(`Invalid color format: must be "#RRGGBB"`);
    }

    // Parse hex values to RGB
    const r = Number.parseInt(cssColor.substring(1, 3), 16);
    const g = Number.parseInt(cssColor.substring(3, 5), 16);
    const b = Number.parseInt(cssColor.substring(5, 7), 16);

    // Check for NaN values from invalid hex
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      throw new Error(`Invalid hex values in color: ${cssColor}`);
    }

    // Set in Live's color format (0x00RRGGBB)
    this.set("color", (r << 16) | (g << 8) | b);
  };

  LiveAPI.prototype.setAll = function (properties) {
    for (const [property, value] of Object.entries(properties)) {
      if (value != null) {
        if (property === "color") {
          this.setColor(value);
        } else {
          this.set(property, value);
        }
      }
    }
  };

  // Index extraction getters (only define if not already defined)
  if (!Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "trackIndex")) {
    Object.defineProperty(LiveAPI.prototype, "trackIndex", {
      get: function () {
        const match = this.path.match(/live_set tracks (\d+)/);
        return match ? Number(match[1]) : null;
      },
    });
  }

  if (!Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "sceneIndex")) {
    Object.defineProperty(LiveAPI.prototype, "sceneIndex", {
      get: function () {
        // Try scene path first
        let match = this.path.match(/live_set scenes (\d+)/);
        if (match) return Number(match[1]);

        // Also try clip_slots path (scene index is the clip slot index in session view)
        match = this.path.match(/live_set tracks \d+ clip_slots (\d+)/);
        return match ? Number(match[1]) : null;
      },
    });
  }

  if (
    !Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "clipSlotIndex")
  ) {
    Object.defineProperty(LiveAPI.prototype, "clipSlotIndex", {
      get: function () {
        // Try clip_slots path first
        let match = this.path.match(/live_set tracks \d+ clip_slots (\d+)/);
        if (match) return Number(match[1]);

        // Also try scene path (clip slot index is the scene index in session view)
        match = this.path.match(/live_set scenes (\d+)/);
        return match ? Number(match[1]) : null;
      },
    });
  }
}
