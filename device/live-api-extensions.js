// device/live-api-extensions.js
if (typeof LiveAPI !== "undefined") {
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
}
