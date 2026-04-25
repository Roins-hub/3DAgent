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

Set `MODEL_PROVIDER=hunyuan`, `TENCENTCLOUD_SECRET_ID`, `TENCENTCLOUD_SECRET_KEY`, and optional `TENCENTCLOUD_REGION` in `apps/api/.env`.

The provider uses Tencent Cloud API 3.0 signing against `ai3d.tencentcloudapi.com` and the `2025-05-13` API version. The MVP submits `SubmitHunyuanTo3DRapidJob` with:

```json
{
  "Prompt": "用户输入的提示词",
  "ResultFormat": "GLB",
  "EnablePBR": true
}
```

Then it polls `QueryHunyuanTo3DRapidJob` using the returned `JobId`. When a model URL is available in `ResultFile3Ds`, it is written to the local job's `modelUrl`.

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
