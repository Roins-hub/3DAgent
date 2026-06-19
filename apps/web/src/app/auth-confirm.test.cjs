const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appDir = __dirname;
const srcDir = path.join(appDir, "..");

function readSource(relativePath) {
  return fs.readFileSync(path.join(srcDir, relativePath), "utf8");
}

test("auth confirm page exchanges token hash on the app domain", () => {
  const page = readSource("app/auth/confirm/page.tsx");
  const shell = readSource("components/auth/AuthConfirmShell.tsx");

  assert.match(page, /AuthConfirmShell/);
  assert.match(shell, /verifyOtp/);
  assert.match(shell, /token_hash/);
  assert.match(shell, /type:\s*otpType/);
  assert.match(shell, /\/reset-password/);
});

test("email OTP forms use Supabase six digit codes", () => {
  const login = readSource("components/auth/LoginShell.tsx");
  const register = readSource("components/auth/RegisterShell.tsx");

  assert.match(login, /\\d\{6\}/);
  assert.match(register, /\\d\{6\}/);
  assert.doesNotMatch(login, /8位验证码|8位数字/);
  assert.doesNotMatch(register, /8位验证码|8位数字/);
});
