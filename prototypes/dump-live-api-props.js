// Use this in a v8 codebox:

const str = (any) => {
  switch (Object.getPrototypeOf(any ?? Object.prototype)) {
    case Array.prototype:
      return `[${any.map(str).join(", ")}]`;

    case Set.prototype:
      return `Set(${[...any].map(str).join(", ")})`;

    case Object.prototype:
      return `{${Object.entries(any)
        .map(([k, v]) => `${str(k)}: ${str(v)}`)
        .join(", ")}}`;

    case Map.prototype:
      return `Map(${[...any.entries()].map(([k, v]) => `${str(k)} → ${str(v)}`).join(", ")})`;

    case Dict.prototype:
      return `Dict("${any.name}") ${any.stringify().replaceAll("\n", " ")}`;
  }
  const s = String(any);
  return s === "[object Object]" ? any.constructor.name + JSON.stringify(any) : s;
};

const log = (...any) => post(...any.map(str), "\n");

log(`---------------------------------------------
Reloaded on ${new Date().toLocaleString("sv-SE")}`);

const api = new LiveAPI("live_set tracks 0 clip_slots 0 clip");
log("id", api.id);

for (const line of api.info.split("\n")) {
  if (line.startsWith("property ")) {
    const [_p, name, ...rest] = line.split(" ");
    log(name, "→", api.get(name));
  }
}
