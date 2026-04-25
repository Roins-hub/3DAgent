# Architecture

## Overview

The MVP is a local monorepo with a Next.js frontend and a FastAPI backend. The current backend simulates a GPU generation worker, but the public API contract mirrors the shape needed for real 3D model services.

## Frontend

`apps/web` contains two user-facing routes:

- `/`: product landing page with a clear entry into the creation studio.
- `/studio`: chat prompt panel, generation controls, 3D preview, job history, and export controls.

State is managed with Zustand. The preview surface uses React Three Fiber and Drei. The v1 viewer renders a procedural asset that reacts to job state, so the user can validate the workflow before real model hosting is connected.

## API

`apps/api` exposes:

- `GET /api/health`
- `POST /api/jobs`
- `GET /api/jobs`
- `GET /api/jobs/{jobId}`

Jobs are stored in memory. `POST /api/jobs` starts either the mock worker or the configured vendor provider.

Provider selection:

- `MODEL_PROVIDER=mock`: simulated local generation.
- `MODEL_PROVIDER=meshy`: calls Meshy Text-to-3D preview API and polls the vendor task until a model URL is available.
- `MODEL_PROVIDER=hunyuan`: calls Tencent Cloud Hunyuan3D API 3.0 with TC3-HMAC-SHA256 signing.

## Future GPU Worker

For self-hosted models later, replace the simulation or provider task with a queue-backed worker:

1. Persist the job in a database.
2. Push the job payload to Redis, Celery, RQ, or a managed queue.
3. Run Hunyuan3D-2, TRELLIS, Stable Fast 3D, or a ComfyUI workflow in a GPU worker.
4. Store generated assets in S3, R2, MinIO, or local object storage.
5. Update `modelUrl`, `thumbnailUrl`, `metadata`, `status`, and `progress`.

The frontend should not need a major workflow change if the `GenerationJob` contract is preserved.
