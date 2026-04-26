# Forma Agent

Forma Agent 是一个本地 AI 资产生成工作台，包含两个独立页面：

- `3D 模型工作台`：文本生成 3D 模型，支持任务历史、预览和模型导出。
- `图片生成工作台`：文本生成图片，支持比例选择、历史记录、预览和下载。

当前后端使用 FastAPI 代理第三方生成接口，密钥只保存在本地 `.env` 文件中，不会暴露给浏览器。

## 项目结构

```text
apps/web           Next.js 前端
apps/api           FastAPI 后端
packages/shared    前后端共享 TypeScript 类型
docs               架构和接入说明
```

## 页面入口

启动后先打开首页：

```text
http://localhost:3000
```

如果 `3000` 被占用，Next.js 会自动换成终端里显示的端口，例如：

```text
http://localhost:3001
```

主要页面：

```text
/          首页，进入 3D 或图片工作台
/studio    3D 模型工作台
/image     图片生成工作台
```

## 快速启动

第一次运行先安装依赖：

```powershell
cd F:\3DAgent
npm install
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r apps/api/requirements.txt
```

之后从项目根目录启动前后端：

```powershell
cd F:\3DAgent
npm run dev
```

这个命令会同时启动：

```text
FastAPI 后端: http://localhost:8015
Next.js 前端: http://localhost:3000 或终端显示的备用端口
```

## 环境配置

后端配置文件：

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

前端配置文件：

```powershell
Copy-Item apps/web/.env.local.example apps/web/.env.local
```

前端默认连接：

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8015
```

## 3D 模型生成配置

3D 生成使用腾讯云混元生 3D 国内站 API。它需要 Tencent Cloud API 3.0 的 `SecretId` 和 `SecretKey`，不是单个 `sk-*` key。

在 `apps/api/.env` 中填写：

```text
MODEL_PROVIDER=hunyuan
TENCENTCLOUD_SECRET_ID=your_tencentcloud_secret_id
TENCENTCLOUD_SECRET_KEY=your_tencentcloud_secret_key
TENCENTCLOUD_HUNYUAN_PROFILE=domestic
TENCENTCLOUD_REGION=ap-guangzhou
```

如果只想测试页面流程，可以临时改成：

```text
MODEL_PROVIDER=mock
```

## 图片生成配置

图片生成使用 SiliconFlow API。当前已验证可用的模型是：

```text
Qwen/Qwen-Image
```

在 `apps/api/.env` 中填写：

```text
IMAGE_PROVIDER=siliconflow
SILICONFLOW_API_KEY=your_siliconflow_api_key
SILICONFLOW_IMAGE_MODEL=Qwen/Qwen-Image
```

图片生成页面只保留真正有作用的输入：

- 提示词
- 图片比例：`1:1`、`16:9`、`9:16`、`4:3`、`3:4`

“图片风格”独立输入已删除。如果需要风格，请直接写进提示词，例如：

```text
生成一个人物，电影感摄影，柔和侧光，写实风格
```

## API 接口

健康检查：

```powershell
curl http://localhost:8015/api/health
```

创建 3D 任务：

```powershell
curl -X POST http://localhost:8015/api/jobs -H "Content-Type: application/json" -d "{\"prompt\":\"生成一个台灯\",\"mode\":\"text-to-3d\",\"quality\":\"balanced\",\"style\":\"game-ready\",\"targetFormat\":\"glb\"}"
```

创建图片任务：

```powershell
curl -X POST http://localhost:8015/api/image-jobs -H "Content-Type: application/json" -d "{\"prompt\":\"生成一张未来感工作台上的绿色玻璃台灯\",\"aspectRatio\":\"1:1\"}"
```

获取图片任务：

```powershell
curl http://localhost:8015/api/image-jobs
```

## 验证命令

```powershell
npm run lint
npm run build
.\.venv\Scripts\python.exe -m unittest apps.api.test_hunyuan_config
.\.venv\Scripts\python.exe -m py_compile apps/api/main.py apps/api/test_hunyuan_config.py
```

## 提交到 GitHub 前检查

不要提交真实密钥或本地私有文件：

```text
apps/api/.env
apps/web/.env.local
SecretKey.csv
node_modules
.next
.venv
```

可以提交示例配置和代码：

```text
apps/api/.env.example
apps/web/.env.local.example
apps/api/main.py
apps/web
packages/shared
README.md
```
