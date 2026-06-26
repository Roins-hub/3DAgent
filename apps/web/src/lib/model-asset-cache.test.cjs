const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadModelAssetCache() {
  const sourcePath = path.join(__dirname, "model-asset-cache.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const testModule = { exports: {} };
  new Function("module", "exports", output)(testModule, testModule.exports);
  return testModule.exports;
}

test("loadCachedModelBlob returns a cached model without fetching again", async () => {
  const { loadCachedModelBlob } = loadModelAssetCache();
  const cachedBlob = new Blob(["cached glb"]);
  const cache = {
    match: async () => new Response(cachedBlob, { status: 200 }),
    put: async () => {
      throw new Error("should not write cache on cache hit");
    },
  };

  const previousCaches = globalThis.caches;
  const previousFetch = globalThis.fetch;
  globalThis.caches = { open: async () => cache };
  globalThis.fetch = async () => {
    throw new Error("should not fetch on cache hit");
  };

  try {
    const result = await loadCachedModelBlob("https://example.test/model.glb", {});

    assert.equal(await result.blob.text(), "cached glb");
    assert.equal(result.fromCache, true);
  } finally {
    globalThis.caches = previousCaches;
    globalThis.fetch = previousFetch;
  }
});

test("loadCachedModelBlob stores successful model responses", async () => {
  const { loadCachedModelBlob } = loadModelAssetCache();
  let storedResponse = null;
  const cache = {
    match: async () => null,
    put: async (_request, response) => {
      storedResponse = response;
    },
  };

  const previousCaches = globalThis.caches;
  const previousFetch = globalThis.fetch;
  globalThis.caches = { open: async () => cache };
  globalThis.fetch = async () =>
    new Response(new Blob(["network glb"]), {
      status: 200,
      headers: { "content-type": "model/gltf-binary" },
    });

  try {
    const result = await loadCachedModelBlob("https://example.test/model.glb", {});

    assert.equal(await result.blob.text(), "network glb");
    assert.equal(result.fromCache, false);
    assert.ok(storedResponse);
    assert.equal(await storedResponse.clone().text(), "network glb");
  } finally {
    globalThis.caches = previousCaches;
    globalThis.fetch = previousFetch;
  }
});
