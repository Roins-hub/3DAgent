# 智模工坊 3D Agent

智模工坊是一个面向工业设计和 3D 内容生产的本地 AI 工作台。前端使用 Next.js，后端使用 FastAPI 统一代理模型、图片、帮助对话和任务历史接口，真实密钥只保存在本地环境变量文件中，不会暴露给浏览器。

## 主要功能

- 工业模型生成：文本生成 3D 模型任务，支持任务历史、进度轮询、模型预览和模型文件下载。
- 图片生成：文本生成图片，支持比例选择、历史记录、预览、本地缓存和下载。
- CADAM 设计助手：面向工业设计提示词和建模脚本的辅助生成接口。
- 帮助对话：支持普通对话和流式对话，可接入 MIMO 或 OpenAI 兼容接口。
- 用户与历史记录：前端接入 Supabase Auth，后端可把模型和图片任务写入 Supabase 历史表。

## 项目结构

```text
apps/web            Next.js 前端应用
apps/api            FastAPI 后端服务
packages/shared     前后端共享 TypeScript 类型
docs                架构、模型接入和数据库脚本
sheji               设计素材和项目相关资源
```

## 页面入口

启动后打开首页：

```text
http://localhost:3000
```

如果 `3000` 被占用，Next.js 会自动换成终端显示的备用端口。

主要页面：

```text
/             首页
/industrial/cadam   CADAM 工业设计助手
/industrial/chili3d Chili3D 建模入口
/studio       工业模型工作台
/model        模型工作区
/image        图片生成入口
/image/workspace 图片工作区
/help         帮助中心
/contact      联系页面
/login        登录
/register     注册
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

复制环境变量示例：

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.local.example apps/web/.env.local
```

从项目根目录同时启动前后端：

```powershell
npm run dev
```

默认服务地址：

```text
FastAPI 后端: http://localhost:8016
Next.js 前端: http://localhost:3000 或终端显示的备用端口
```

## 环境配置

前端默认连接后端：

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8016
```

工业模型生成可选择 `mock`、`hunyuan`、`neural4d` 或 `meshy`：

```text
MODEL_PROVIDER=hunyuan
TENCENT_TOKENHUB_API_KEY=your_tokenhub_api_key
TENCENT_TOKENHUB_MODEL=hy-3d-3.1
```

混元 3D 使用腾讯 TokenHub：`TENCENT_TOKENHUB_API_KEY` 默认调用 `hy-3d-3.1`。

图片生成可选择 `siliconflow`、`openai` 或 `mock`：

```text
IMAGE_PROVIDER=siliconflow
SILICONFLOW_API_KEY=your_siliconflow_api_key
SILICONFLOW_IMAGE_MODEL=Kwai-Kolors/Kolors
```

帮助对话默认使用 MIMO 兼容接口，也可以改成 OpenAI 兼容接口：

```text
MIMO_API_KEY=your_mimo_api_key
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
MIMO_CHAT_MODEL=mimo-v2.5-pro
CADAM_LLM_PROVIDER=mimo
```

Supabase 登录和历史记录：

```text
SUPABASE_URL=your_supabase_project_url
SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

数据库脚本见：

```text
docs/supabase-history.sql
```

## API 接口

健康检查：

```powershell
curl http://localhost:8016/api/health
```

创建工业模型任务：

```powershell
curl -X POST http://localhost:8016/api/jobs -H "Content-Type: application/json" -d "{\"prompt\":\"生成一个台灯\",\"mode\":\"text-to-3d\",\"quality\":\"balanced\",\"style\":\"game-ready\",\"targetFormat\":\"glb\"}"
```

获取工业模型任务：

```powershell
curl http://localhost:8016/api/jobs
curl http://localhost:8016/api/jobs/{job_id}
curl http://localhost:8016/api/jobs/{job_id}/model
```

创建图片任务：

```powershell
curl -X POST http://localhost:8016/api/image-jobs -H "Content-Type: application/json" -d "{\"prompt\":\"生成一张未来感工作台上的绿色玻璃台灯\",\"aspectRatio\":\"1:1\"}"
```

获取图片任务：

```powershell
curl http://localhost:8016/api/image-jobs
curl http://localhost:8016/api/image-jobs/{job_id}
curl http://localhost:8016/api/image-jobs/{job_id}/image
```

## 验证命令

```powershell
npm run lint
npm run build
.\.venv\Scripts\python.exe -m unittest apps.api.test_hunyuan_config apps.api.test_neural4d_provider apps.api.test_history_persistence
.\.venv\Scripts\python.exe -m py_compile apps/api/main.py
```

## 上传 GitHub 前检查

不要提交真实密钥或本地缓存：

```text
apps/api/.env
apps/web/.env.local
SecretKey.csv
node_modules
.next
.venv
.cache
__pycache__
```

可以提交示例配置、源码、文档和必要素材：

```text
apps/api/.env.example
apps/web/.env.local.example
apps/api
apps/web
packages/shared
docs
sheji
README.md
```

## 开源协议

本项目基于 MIT License 开源，详见 [LICENSE](./LICENSE)。
