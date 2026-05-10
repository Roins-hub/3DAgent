const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadAuthUtils() {
  const sourcePath = path.join(__dirname, "auth-utils.ts");
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

test("isDuplicateSignUpResult detects Supabase duplicate email identity responses", () => {
  const { isDuplicateSignUpResult } = loadAuthUtils();

  assert.equal(
    isDuplicateSignUpResult({
      user: {
        id: "existing-user",
        email: "used@example.com",
        identities: [],
      },
    }),
    true,
  );
});

test("isDuplicateSignUpResult allows normal new signups", () => {
  const { isDuplicateSignUpResult } = loadAuthUtils();

  assert.equal(
    isDuplicateSignUpResult({
      user: {
        id: "new-user",
        email: "new@example.com",
        identities: [{ id: "identity-1" }],
      },
    }),
    false,
  );
});
