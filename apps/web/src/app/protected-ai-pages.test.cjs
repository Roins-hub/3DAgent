const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appDir = __dirname;

const protectedPages = [
  "help/page.tsx",
  "model/page.tsx",
  "image/page.tsx",
  "industrial/cadam/page.tsx",
  "industrial/cadam/loading/page.tsx",
  "industrial/cadam/preview/page.tsx",
  "industrial/chili3d/page.tsx",
];

const publicPages = ["page.tsx", "contact/page.tsx"];

function readPage(relativePath) {
  return fs.readFileSync(path.join(appDir, relativePath), "utf8");
}

test("AI feature pages require AuthGate", () => {
  for (const relativePath of protectedPages) {
    const source = readPage(relativePath);

    assert.match(source, /AuthGate/, `${relativePath} should import and render AuthGate`);
  }
});

test("public contact and workflow entry stay outside AuthGate", () => {
  for (const relativePath of publicPages) {
    const source = readPage(relativePath);

    assert.doesNotMatch(source, /AuthGate/, `${relativePath} should remain public`);
  }
});
