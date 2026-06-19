import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePublic = path.join(root, "apps", "web", "public");
const sourceStatic = path.join(root, "apps", "web", ".next", "static");
const targetPublic = path.join(
  root,
  "apps",
  "web",
  ".next",
  "standalone",
  "apps",
  "web",
  "public",
);
const targetStatic = path.join(
  root,
  "apps",
  "web",
  ".next",
  "standalone",
  "apps",
  "web",
  ".next",
  "static",
);

if (!existsSync(sourcePublic)) {
  throw new Error(`Missing source public directory: ${sourcePublic}`);
}

if (!existsSync(sourceStatic)) {
  throw new Error(`Missing source static directory: ${sourceStatic}`);
}

if (!existsSync(path.dirname(targetPublic))) {
  throw new Error(
    "Missing Next standalone output. Run `npm --workspace @3dagent/web run build` first.",
  );
}

rmSync(targetPublic, { recursive: true, force: true });
cpSync(sourcePublic, targetPublic, { recursive: true });
rmSync(targetStatic, { recursive: true, force: true });
cpSync(sourceStatic, targetStatic, { recursive: true });

console.log(`Copied ${sourcePublic} -> ${targetPublic}`);
console.log(`Copied ${sourceStatic} -> ${targetStatic}`);
