# 3D Agent Platform MVP

A local MVP for a chat-driven AI 3D model generation platform. It includes a landing page, a professional generation studio, a Three.js preview surface, job history, export controls, and a FastAPI mock generation backend shaped for future Hunyuan3D-2 or TRELLIS integration.

## Project Structure

```text
apps/web          Next.js + React Three Fiber frontend
apps/api          FastAPI mock generation API
packages/shared   Shared TypeScript job contracts
docs              Architecture and model integration notes
```

## Frontend Setup

```powershell
npm install
npm run dev:web
```

The web app runs at `http://localhost:3000`.

## API Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r apps/api/requirements.txt
cd apps/api
uvicorn main:app --reload --port 8015
```

The API runs at `http://localhost:8015`.

## Meshy API Setup

By default the API runs in mock mode. To call a real vendor API, create `apps/api/.env`:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

Then edit `apps/api/.env`:

```text
MODEL_PROVIDER=meshy
MESHY_API_KEY=your_real_meshy_api_key
```

Restart the API after changing `.env`. In Meshy mode, `POST /api/jobs` submits a real Text-to-3D preview task to Meshy and polls until a model URL is returned.

## Tencent Cloud Hunyuan3D API Setup

The Tencent Cloud Hunyuan3D API uses Tencent Cloud API 3.0 signing. It needs a `SecretId` and `SecretKey`, not a single `sk-*` key. The default profile uses the domestic endpoint and Guangzhou region.

Create `apps/api/.env`:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

Then edit:

```text
MODEL_PROVIDER=hunyuan
TENCENTCLOUD_SECRET_ID=your_tencentcloud_secret_id
TENCENTCLOUD_SECRET_KEY=your_tencentcloud_secret_key
TENCENTCLOUD_HUNYUAN_PROFILE=domestic
TENCENTCLOUD_REGION=ap-guangzhou
```

Restart the API after changing `.env`. In Hunyuan mode, `POST /api/jobs` submits a real text-to-3D job to Tencent Cloud and polls until a model URL is returned.

## Image Generation Setup

Image generation uses SiliconFlow by default. Create an API key in SiliconFlow, then add it to `apps/api/.env`.

```text
IMAGE_PROVIDER=siliconflow
SILICONFLOW_API_KEY=your_siliconflow_api_key
SILICONFLOW_IMAGE_MODEL=Qwen/Qwen-Image
```

In image mode, `POST /api/image-jobs` creates a text-to-image job and `/api/image-jobs/{id}/image` proxies the generated image.

## Environment

Copy the example frontend environment file if you need to change the API URL:

```powershell
Copy-Item apps/web/.env.local.example apps/web/.env.local
```

Default:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8015
```

## Verification

```powershell
npm run lint
npm run build
```

API smoke tests:

```powershell
curl http://localhost:8015/api/health
curl -X POST http://localhost:8015/api/jobs -H "Content-Type: application/json" -d "{\"prompt\":\"生成一个台灯\",\"mode\":\"text-to-3d\",\"quality\":\"balanced\",\"style\":\"game-ready\",\"targetFormat\":\"glb\"}"
curl -X POST http://localhost:8015/api/image-jobs -H "Content-Type: application/json" -d "{\"prompt\":\"生成一张未来感工作台上的绿色玻璃台灯\",\"aspectRatio\":\"1:1\"}"
```
