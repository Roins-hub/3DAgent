import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./api-routing.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const tempDir = mkdtempSync(join(tmpdir(), "api-routing-"));
const modulePath = join(tempDir, "api-routing.mjs");
writeFileSync(modulePath, compiled.outputText, "utf8");

const {
  DESKTOP_API_FALLBACK_BASE_URL,
  apiBaseUrlCandidates,
  normalizeApiBaseUrl,
} = await import(pathToFileURL(modulePath).href);

test("normalizes empty values and strips trailing slashes", () => {
  assert.equal(normalizeApiBaseUrl("http://localhost:8016///"), "http://localhost:8016");
  assert.equal(normalizeApiBaseUrl(""), "http://localhost:8016");
});

test("adds desktop fallback only for local browser pages using a local API", () => {
  assert.deepEqual(apiBaseUrlCandidates("http://localhost:8016", "localhost"), [
    "http://localhost:8016",
    DESKTOP_API_FALLBACK_BASE_URL,
  ]);
});

test("prefers the desktop API when running inside the desktop shell", () => {
  assert.deepEqual(
    apiBaseUrlCandidates("http://localhost:8016", "127.0.0.1", true),
    [DESKTOP_API_FALLBACK_BASE_URL, "http://localhost:8016"],
  );
});

test("does not add desktop fallback for deployed pages", () => {
  assert.deepEqual(apiBaseUrlCandidates("https://api.example.com", "admin.example.com"), [
    "https://api.example.com",
  ]);
});

test("uses same-origin API for deployed pages when no API base URL is configured", () => {
  assert.deepEqual(apiBaseUrlCandidates("", "ai.hhlai.xyz"), [""]);
});
