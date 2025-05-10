// device/live-api-extensions.js
if (typeof LiveAPI !== "undefined") {
  LiveAPI.prototype.getProperty = function (prop) {
    return this.get(prop)?.[0];
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
}
