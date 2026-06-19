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

test("formatAuthErrorMessage explains disabled Supabase signups", () => {
  const { formatAuthErrorMessage } = loadAuthUtils();

  assert.equal(
    formatAuthErrorMessage(new Error("Email signups are disabled"), "send-login-code"),
    "Supabase 邮箱注册当前未开启，请在 Supabase Auth 设置中启用 Email signup 后再试。",
  );
});

test("formatAuthErrorMessage explains Supabase fetch failures", () => {
  const { formatAuthErrorMessage } = loadAuthUtils();

  assert.equal(
    formatAuthErrorMessage(new TypeError("Failed to fetch"), "send-login-code"),
    "无法连接到 Supabase，请检查网络、代理或稍后重试。",
  );
});

test("login OTP explicitly allows creating new users", () => {
  const sourcePath = path.join(__dirname, "..", "components", "auth", "LoginShell.tsx");
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /shouldCreateUser:\s*true/);
});
