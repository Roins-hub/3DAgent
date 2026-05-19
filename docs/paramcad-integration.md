# 工程 CAD 集成

`3DAgent` 现在默认使用本仓库内的 `engines/cad-script-engine`，由 FastAPI 作为子进程调用，不需要单独启动旧的 `AI-ParamCAD` Java 后端。

## 启动

只启动主应用：

```powershell
npm run dev
```

需要同时打开后台管理面板：

```powershell
npm run dev:all
```

## 配置

`apps/api/.env`：

```text
PARAMCAD_ENGINE=cad-script
CAD_SCRIPT_GENERATOR=llm
CAD_SCRIPT_BASE_URL=https://api.deepseek.com
CAD_SCRIPT_MODEL=deepseek-v4-flash
CAD_SCRIPT_API_KEY=your_cad_script_api_key_here
CAD_SCRIPT_REPAIR=true
CAD_SCRIPT_TIMEOUT_SECONDS=420
CAD_SCRIPT_MAX_TOKENS=16000
CAD_SCRIPT_PROCESS_TIMEOUT_SECONDS=900
```

## API

3DAgent 后端会统一提供工程 CAD 接口：

```text
POST /api/paramcad/run
GET  /api/paramcad/outputs/{stepFile}
```

工程 CAD 任务会写入 `generation_jobs`，`kind` 为 `paramcad`。

## 验收

1. 启动 `npm run dev`。
2. 登录前端，进入 CADAM 工作台，切换到“工程 CAD”。
3. 输入工程零件需求，按需勾选“运行 FEA 校核”，点击“运行工程 CAD”。
4. 页面应显示优化参数、FEA 指标和 STEP 下载入口。
5. 如需后台检查，启动 `npm run dev:all`，在后台管理里按“工程 CAD”筛选，应能看到 `paramcad` 类型任务。

如果后端报 `generation_jobs` 约束错误，重新执行 `docs/supabase-history.sql` 中的约束更新语句。
