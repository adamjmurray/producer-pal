/* eslint-disable @stylistic/padding-line-between-statements -- switch fallthrough patterns */
if (typeof LiveAPI !== "undefined") {
  /**
   * Create a LiveAPI instance from an ID or path, automatically handling ID prefixing
   * @param {string|number|Array<string|number>} idOrPath - ID number/string, full path, or ["id", "123"] array
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
    // id can be "id 0", "0", or 0 (number) when object doesn't exist
    const id = /** @type {string | number} */ (this.id);

    return id !== "id 0" && id !== "0" && id !== 0;
  };

  /**
   * Get a Live API property value with type-appropriate handling
   * @param {string} property - Property name to get
   * @returns {unknown} Property value
   */
  LiveAPI.prototype.getProperty = function (property) {
    switch (property) {
      case "scale_intervals":
      case "available_warp_modes":
        return this.get(property);
      case "available_input_routing_channels":
      case "available_input_routing_types":
      case "available_output_routing_channels":
      case "available_output_routing_types":
      case "input_routing_channel":
      case "input_routing_type":
      case "output_routing_channel":
      case "output_routing_type": {
        const rawValue = this.get(property);
        if (rawValue && rawValue[0]) {
          try {
            const parsed = JSON.parse(/** @type {string} */ (rawValue[0]));

            return parsed[property];
          } catch {
            return null;
          }
        }

        return null;
      }
      default:
        return this.get(property)?.[0];
    }
  };

  /**
   * Set a Live API property with type-appropriate handling
   * @param {string} property - Property name to set
   * @param {unknown} value - Property value to set
   * @returns {void}
   */
  LiveAPI.prototype.setProperty = function (property, value) {
    const val = /** @type {any} */ (value);

    switch (property) {
      case "input_routing_type":
      case "input_routing_channel":
      case "output_routing_type":
      case "output_routing_channel": {
        // Convert value to JSON format expected by Live API
        const jsonValue = JSON.stringify({ [property]: val });
        return this.set(property, jsonValue);
      }
      case "selected_track":
      case "selected_scene":
      case "detail_clip":
      case "highlighted_clip_slot": {
        // Properties that expect "id X" format - automatically format IDs
        const formattedValue =
          typeof val === "string" && !val.startsWith("id ") && /^\d+$/.test(val)
            ? `id ${val}`
            : val;
        return this.set(property, formattedValue);
      }
      default:
        // For all other properties, use regular set
        return this.set(property, val);
    }
  };

  /**
   * Get child object IDs for a named collection
   * @param {string} name - Collection name to query
   * @returns {string[]} Array of child IDs in "id X" format
   */
  LiveAPI.prototype.getChildIds = function (name) {
    const idArray = this.get(name);

    if (!Array.isArray(idArray)) {
      return [];
    }

    const children = [];
    for (let i = 0; i < idArray.length; i += 2) {
      if (idArray[i] === "id") {
        children.push(`id ${idArray[i + 1]}`);
      }
    }
    return children;
  };

  /**
   * Get child LiveAPI instances for a named collection
   * @param {string} name - Collection name to query
   * @returns {LiveAPI[]} Array of child LiveAPI instances
   */
  LiveAPI.prototype.getChildren = function (name) {
    return this.getChildIds(name).map((id) => new LiveAPI(id));
  };

  LiveAPI.prototype.getColor = function () {
    const colorValue = /** @type {number | undefined} */ (
      this.getProperty("color")
    );
    if (colorValue === undefined) {
      return null;
    }

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

  /**
   * Set color from CSS hex format
   * @param {string} cssColor - Color in "#RRGGBB" format
   */
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

  /**
   * Set multiple properties at once
   * @param {Record<string, unknown>} properties - Properties to set
   */
  LiveAPI.prototype.setAll = function (properties) {
    for (const [property, value] of Object.entries(properties)) {
      if (value != null) {
        if (property === "color") {
          this.setColor(/** @type {string} */ (value));
        } else {
          this.set(property, /** @type {any} */ (value));
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

  // Return track index extension
  if (
    !Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "returnTrackIndex")
  ) {
    Object.defineProperty(LiveAPI.prototype, "returnTrackIndex", {
      get: function () {
        const match = this.path.match(/live_set return_tracks (\d+)/);
        return match ? Number(match[1]) : null;
      },
    });
  }

  // Track category extension
  if (!Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "category")) {
    Object.defineProperty(LiveAPI.prototype, "category", {
      get: function () {
        if (this.path.includes("live_set tracks")) {
          return "regular";
        } else if (this.path.includes("live_set return_tracks")) {
          return "return";
        } else if (this.path.includes("live_set master_track")) {
          return "master";
        }
        return null;
      },
    });
  }

  if (!Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "sceneIndex")) {
    Object.defineProperty(LiveAPI.prototype, "sceneIndex", {
      get: function () {
        // Try scene path first
        let match = this.path.match(/live_set scenes (\d+)/);
        if (match) {
          return Number(match[1]);
        }

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
        if (match) {
          return Number(match[1]);
        }

        // Also try scene path (clip slot index is the scene index in session view)
        match = this.path.match(/live_set scenes (\d+)/);
        return match ? Number(match[1]) : null;
      },
    });
  }

  // Device index extension - matches LAST "devices X" for nested rack support
  if (!Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "deviceIndex")) {
    Object.defineProperty(LiveAPI.prototype, "deviceIndex", {
      get: function () {
        const matches = this.path.match(/devices (\d+)/g);
        if (!matches) return null;
        const lastMatch = matches.at(-1).match(/devices (\d+)/);
        return lastMatch ? Number(lastMatch[1]) : null;
      },
    });
  }

  if (
    !Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "timeSignature")
  ) {
    Object.defineProperty(LiveAPI.prototype, "timeSignature", {
      get: function () {
        // Different Live API object types use different property names for time signature
        const objectType = this.type;
        let numeratorProp, denominatorProp;

        switch (objectType) {
          case "Scene":
            numeratorProp = "time_signature_numerator";
            denominatorProp = "time_signature_denominator";
            break;
          default:
            numeratorProp = "signature_numerator";
            denominatorProp = "signature_denominator";
            break;
        }

        const numerator = this.getProperty(numeratorProp);
        const denominator = this.getProperty(denominatorProp);

        if (numerator != null && denominator != null) {
          return `${numerator}/${denominator}`;
        }

        return null;
      },
    });
  }
}
