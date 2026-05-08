(function () {
  if (typeof globalThis.Float16Array !== "undefined") {
    return;
  }

  class Float16Array extends Uint16Array {
    static BYTES_PER_ELEMENT = 2;
  }

  Object.defineProperty(Float16Array.prototype, Symbol.toStringTag, {
    value: "Float16Array",
  });

  globalThis.Float16Array = Float16Array;
})();
