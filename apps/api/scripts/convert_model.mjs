import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { Matrix3, Vector3 } from "three";
import { GLTFLoader } from "../../../node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import { OBJExporter } from "../../../node_modules/three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "../../../node_modules/three/examples/jsm/exporters/STLExporter.js";

const [, , inputPath, outputPath, targetFormat] = process.argv;

if (!inputPath || !outputPath || !targetFormat) {
  console.error("Usage: node convert_model.mjs <input.glb> <output> <obj|stl|fbx>");
  process.exit(2);
}

function arrayBufferFromBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function loadGlbScene(path) {
  const data = await readFile(path);
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(arrayBufferFromBuffer(data), "", resolve, reject);
  });
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
}

function sanitizeName(value) {
  return String(value || "Mesh").replace(/[^A-Za-z0-9_]/g, "_") || "Mesh";
}

function fbxArray(values) {
  return values.map((value) => Number(value).toFixed(6).replace(/\.?0+$/, "")).join(",");
}

function collectMeshTriangles(scene) {
  const meshes = [];
  scene.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) {
      return;
    }

    const geometry = object.geometry;
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const index = geometry.index;
    const normalMatrix = new Matrix3().getNormalMatrix(object.matrixWorld);
    const vertices = [];
    const normals = [];
    const indices = [];

    function pushVertex(vertexIndex) {
      const vertex = new Vector3().fromBufferAttribute(position, vertexIndex);
      vertex.applyMatrix4(object.matrixWorld);
      vertices.push(vertex.x, vertex.y, vertex.z);

      if (normal) {
        const normalVector = new Vector3().fromBufferAttribute(normal, vertexIndex);
        normalVector.applyMatrix3(normalMatrix).normalize();
        normals.push(normalVector.x, normalVector.y, normalVector.z);
      }

      return vertices.length / 3 - 1;
    }

    const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3);
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const a = index ? index.getX(triangle * 3) : triangle * 3;
      const b = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
      const c = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
      indices.push(pushVertex(a), pushVertex(b), -pushVertex(c) - 1);
    }

    if (vertices.length > 0) {
      meshes.push({
        name: sanitizeName(object.name || basename(inputPath, ".glb")),
        vertices,
        normals,
        indices,
      });
    }
  });
  return meshes;
}

function exportFbxAscii(scene) {
  const meshes = collectMeshTriangles(scene);
  if (meshes.length === 0) {
    throw new Error("No mesh geometry found in GLB.");
  }

  let nextId = 100000;
  const objects = [];
  const connections = [];
  for (const mesh of meshes) {
    const geometryId = nextId++;
    const modelId = nextId++;
    const normalLayer =
      mesh.normals.length > 0
        ? `
        LayerElementNormal: 0 {
            Version: 101
            Name: ""
            MappingInformationType: "ByPolygonVertex"
            ReferenceInformationType: "Direct"
            Normals: *${mesh.normals.length} {
                a: ${fbxArray(mesh.normals)}
            }
        }`
        : "";

    objects.push(`
        Geometry: ${geometryId}, "Geometry::${mesh.name}", "Mesh" {
            Vertices: *${mesh.vertices.length} {
                a: ${fbxArray(mesh.vertices)}
            }
            PolygonVertexIndex: *${mesh.indices.length} {
                a: ${mesh.indices.join(",")}
            }${normalLayer}
            Layer: 0 {
                Version: 100
                LayerElement: {
                    Type: "LayerElementNormal"
                    TypedIndex: 0
                }
            }
        }
        Model: ${modelId}, "Model::${mesh.name}", "Mesh" {
            Version: 232
            Properties70:  {
                P: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
                P: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0
                P: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
            }
            Shading: T
            Culling: "CullingOff"
        }`);
    connections.push(`        C: "OO",${geometryId},${modelId}`);
    connections.push(`        C: "OO",${modelId},0`);
  }

  return `; FBX 7.4.0 project file
FBXHeaderExtension:  {
    FBXHeaderVersion: 1003
    FBXVersion: 7400
    Creator: "3DAgent model converter"
}
GlobalSettings:  {
    Version: 1000
    Properties70:  {
        P: "UpAxis", "int", "Integer", "",1
        P: "UpAxisSign", "int", "Integer", "",1
        P: "FrontAxis", "int", "Integer", "",2
        P: "FrontAxisSign", "int", "Integer", "",1
        P: "CoordAxis", "int", "Integer", "",0
        P: "CoordAxisSign", "int", "Integer", "",1
        P: "UnitScaleFactor", "double", "Number", "",1
    }
}
Documents:  {
    Count: 1
    Document: 123456789, "Scene", "Scene" {
        RootNode: 0
    }
}
Definitions:  {
    Version: 100
    Count: ${meshes.length * 2}
    ObjectType: "Geometry" { Count: ${meshes.length} }
    ObjectType: "Model" { Count: ${meshes.length} }
}
Objects:  {
${objects.join("\n")}
}
Connections:  {
${connections.join("\n")}
}
`;
}

const scene = await loadGlbScene(inputPath);

if (targetFormat === "obj") {
  await writeFile(outputPath, new OBJExporter().parse(scene), "utf8");
} else if (targetFormat === "stl") {
  await writeFile(outputPath, new STLExporter().parse(scene, { binary: false }), "utf8");
} else if (targetFormat === "fbx") {
  await writeFile(outputPath, exportFbxAscii(scene), "utf8");
} else {
  throw new Error(`Unsupported target format: ${targetFormat}`);
}
