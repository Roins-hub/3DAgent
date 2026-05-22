# Model Integration Contract

## Current MVP

The backend currently simulates generation and returns:

```json
{
  "status": "completed",
  "progress": 100,
  "modelUrl": "/models/demo-asset.glb",
  "metadata": {
    "engine": "Mock GPU worker, Hunyuan3D-compatible contract",
    "polygonBudget": "18k preview triangles",
    "textureSet": "PBR base color, roughness, normal placeholders"
  }
}
```

## Meshy API Provider

Set `MODEL_PROVIDER=meshy` and `MESHY_API_KEY` in `apps/api/.env`.

The MVP currently uses Meshy's Text-to-3D preview task:

1. `POST /api/jobs` creates a local job.
2. The backend submits a Meshy preview task.
3. The backend polls Meshy every few seconds.
4. When Meshy succeeds, the local job is marked `completed` and `modelUrl` is set from Meshy's returned `model_urls`.

Current limitation: only `mode=text-to-3d` is supported for Meshy in this MVP. Image-to-3D can be added as a separate provider path once upload storage is introduced.

## Tencent Cloud Hunyuan3D Provider

Set `MODEL_PROVIDER=hunyuan` and `TENCENT_TOKENHUB_API_KEY` in `apps/api/.env`.

The provider uses Tencent TokenHub with model `hy-3d-3.1`, Bearer-token authentication, and these endpoints:

- `POST /v1/api/3d/submit`
- `POST /v1/api/3d/query`

The MVP submits TokenHub 3D jobs with:

```json
{
  "model": "hy-3d-3.1",
  "prompt": "user prompt",
  "result_format": "GLB",
  "enable_pbr": true
}
```

Then it polls `/v1/api/3d/query` using the returned task id. When a model URL is available in `data`, it is written to the local job's `modelUrl`.

## Neural4D API Provider

Set `MODEL_PROVIDER=neural4d` and `NEURAL4D_API_TOKEN` in `apps/api/.env`.

Optional Neural4D settings:

```env
NEURAL4D_BASE_URL=https://alb.neural4d.com:3000/api
NEURAL4D_MODEL_COUNT=1
```

The provider uses Neural4D's text-to-3D workflow:

1. `POST /api/jobs` creates a local job.
2. The backend submits `generateModelWithText` with `prompt`, `modelCount`, and `disablePbr=0`.
3. The backend stores the first returned Neural4D UUID as `metadata.providerTaskId`.
4. The backend polls `queryJobProgress` and `retrieveModel`.
5. When `retrieveModel` returns `codeStatus=0`, the local job is marked `completed` and `modelUrl` is set from Neural4D's returned URL.

For `targetFormat=fbx` or `targetFormat=obj`, the provider calls `convertToFormat` after generation completes and keeps the local job in `postprocessing` while Neural4D converts the model. `targetFormat=glb` uses the model URL returned by `retrieveModel` directly.

Current limitation: only `mode=text-to-3d` is supported for Neural4D in this app. Neural4D image-to-3D requires the matting-image flow and upload handling, which should be added as a separate path.

## Replace With Hunyuan3D-2

Run Hunyuan3D-2 as a separate service or worker. The worker should accept the same generation payload:

```json
{
  "prompt": "生成一把低多边形魔法剑",
  "mode": "text-to-3d",
  "quality": "balanced",
  "style": "game-ready",
  "targetFormat": "glb"
}
```

The worker should return or update:

- `modelUrl`: downloadable GLB, FBX, or OBJ asset URL.
- `thumbnailUrl`: optional preview image.
- `metadata.engine`: model or workflow used.
- `metadata.polygonBudget`: approximate mesh complexity.
- `metadata.textureSet`: generated material maps.

## Replace With TRELLIS or TRELLIS.2

Use the same API contract, but route `mode=image-to-3d` jobs to an image-based TRELLIS pipeline. Store uploaded images before queueing the job and pass their storage URL to the worker.

## Blender Postprocessing

After generation, a Blender Python worker can normalize scale, set origin, simplify geometry, repack textures, validate material slots, and export the requested format. The API should keep reporting `postprocessing` while this step runs.

