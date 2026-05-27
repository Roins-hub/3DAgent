import { readFile, writeFile } from "node:fs/promises";
import { OBJLoader } from "../../../node_modules/three/examples/jsm/loaders/OBJLoader.js";
import { GLTFExporter } from "../../../node_modules/three/examples/jsm/exporters/GLTFExporter.js";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Usage: node convert_obj_to_glb.mjs <input.obj> <output.glb>");
  process.exit(2);
}

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          this.result = buffer;
          this.onloadend?.();
        })
        .catch((error) => {
          this.error = error;
          this.onerror?.(error);
        });
    }
  };
}

const source = await readFile(inputPath, "utf8");
const scene = new OBJLoader().parse(source);
scene.updateMatrixWorld(true);

const exporter = new GLTFExporter();
const glb = await new Promise((resolve, reject) => {
  exporter.parse(scene, resolve, reject, { binary: true });
});

await writeFile(outputPath, Buffer.from(glb));
