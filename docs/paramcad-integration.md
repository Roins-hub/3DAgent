# AI-ParamCAD 集成

`3DAgent` 作为统一产品入口，`AI-ParamCAD` 作为工程 CAD 引擎服务。

## 引擎位置

```powershell
git clone https://github.com/Roins-hub/AI-ParamCAD.git engines/AI-ParamCAD
```

## 启动

只启动 3DAgent：

```powershell
npm run dev
```

同时启动 3DAgent 和 AI-ParamCAD：

```powershell
npm run dev:all
```

只启动 AI-ParamCAD 引擎：

```powershell
npm run dev:paramcad
```

## 配置

`apps/api/.env`：

```text
AI_PARAMCAD_BASE_URL=http://localhost:8088
AI_PARAMCAD_TIMEOUT_SECONDS=180
```

## API

3DAgent 后端会代理 AI-ParamCAD：

```text
POST /api/paramcad/run
GET  /api/paramcad/outputs/{stepFile}
```

工程 CAD 任务会写入 `generation_jobs`，`kind` 为 `paramcad`。

## 阶段 4 验收

阶段 4 的目标是让工程 CAD 集成可以被本地完整验证，并保留清晰的排障入口。

1. 确认 Supabase 约束已包含 `paramcad`。
2. 启动后端、前端和 AI-ParamCAD 引擎：

```powershell
npm run dev:all
```

3. 登录前端，进入 CADAM 工作台，切换到“工程 CAD”。
4. 输入工程零件需求，按需勾选“运行 FEA 校核”，点击“运行工程 CAD”。
5. 页面应显示优化参数、FEA 指标和 STEP 下载入口。
6. 在后台管理里按“工程 CAD”筛选，应能看到 `paramcad` 类型任务。

## 常见问题

如果页面提示 AI-ParamCAD 引擎未连接，先确认引擎端口可访问：

```powershell
curl http://localhost:8088/api/health
```

如果后端报 `generation_jobs` 约束错误，重新执行 `docs/supabase-history.sql` 中的约束更新语句。

工程 CAD 模式不会回退到 OpenSCAD。本模式依赖 AI-ParamCAD 返回 STEP 文件；OpenSCAD 模式只负责本地 STL 预览和导出。
