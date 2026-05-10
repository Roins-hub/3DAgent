const assert = require("node:assert/strict");
const test = require("node:test");

const { compareVersions, isNewerVersion } = require("./update-utils.cjs");

test("compareVersions compares semantic version numbers numerically", () => {
  assert.equal(compareVersions("1.10.0", "1.2.9"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.0.0", "1.0.1"), -1);
});

test("isNewerVersion only accepts greater remote versions", () => {
  assert.equal(isNewerVersion("1.1.3", "1.1.2"), true);
  assert.equal(isNewerVersion("1.1.2", "1.1.2"), false);
  assert.equal(isNewerVersion("1.1.1", "1.1.2"), false);
});
