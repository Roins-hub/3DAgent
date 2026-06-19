const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadCadamRouting() {
  const sourcePath = path.join(__dirname, "cadam-routing.ts");
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

test("buildCadamLoadingHref carries the submitted requirement and request id", () => {
  const { buildCadamLoadingHref } = loadCadamRouting();

  assert.equal(
    buildCadamLoadingHref("make a bracket with M6 mounting holes", "request-1"),
    "/industrial/cadam/loading?requirement=make+a+bracket+with+M6+mounting+holes&requestId=request-1",
  );
});

test("buildCadamPreviewHref maps generation results to the preview page", () => {
  const { buildCadamPreviewHref } = loadCadamRouting();

  assert.equal(
    buildCadamPreviewHref({
      title: "bearing mount",
      geometryType: "bearing_mount",
      stepFile: "bearing.step",
      sourceFile: "bearing.py",
      provider: "cad-script-engine",
      model: "build123d",
    }),
    "/industrial/cadam/preview?title=bearing+mount&geometry=bearing_mount&step=bearing.step&source=bearing.py&provider=cad-script-engine&model=build123d",
  );
});

test("buildParamcadOutputUrl avoids double /api prefixes on deployed same-origin routes", () => {
  const { buildParamcadOutputUrl, buildParamcadPreviewUrl } = loadCadamRouting();

  assert.equal(
    buildParamcadOutputUrl("/api", "bearing mount.step"),
    "/api/paramcad/outputs/bearing%20mount.step",
  );
  assert.equal(
    buildParamcadPreviewUrl("/api/", "bearing.step"),
    "/api/paramcad/outputs/bearing.step/preview.stl",
  );
});

test("buildParamcadOutputUrl supports empty and absolute API bases", () => {
  const { buildParamcadOutputUrl } = loadCadamRouting();

  assert.equal(buildParamcadOutputUrl("", "bearing.step"), "/api/paramcad/outputs/bearing.step");
  assert.equal(
    buildParamcadOutputUrl("https://ai.hhlai.xyz", "bearing.step"),
    "https://ai.hhlai.xyz/api/paramcad/outputs/bearing.step",
  );
});
