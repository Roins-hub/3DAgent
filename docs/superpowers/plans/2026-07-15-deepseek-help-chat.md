# DeepSeek Help Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CAD help assistant's MiMo backend with `deepseek-v4-pro` while preserving the current HTTP contract and streaming UI.

**Architecture:** Add a dedicated help-chat provider adapter inside the existing FastAPI module. The adapter shares the existing prompt construction but owns its DeepSeek URL, model, Bearer authentication, text-only validation, response parsing, and SSE streaming; the public endpoints dispatch through provider-neutral wrapper functions.

**Tech Stack:** Python 3.11, FastAPI, requests, unittest, DeepSeek OpenAI-compatible Chat Completions API.

---

## File Map

- Modify `apps/api/main.py`: help-chat provider configuration, DeepSeek request/stream adapter, provider dispatch, endpoint wiring.
- Create `apps/api/test_help_chat_provider.py`: focused request, response, streaming, configuration, and error tests.
- Modify `apps/api/.env.example`: document non-secret help-chat settings and the DeepSeek secret name.

### Task 1: DeepSeek request configuration and non-streaming adapter

**Files:**
- Create: `apps/api/test_help_chat_provider.py`
- Modify: `apps/api/main.py`

- [ ] **Step 1: Write failing configuration and request tests**

Create tests that load `apps.api.main` with `HELP_CHAT_PROVIDER=deepseek`, `HELP_CHAT_MODEL=deepseek-v4-pro`, `DEEPSEEK_BASE_URL=https://api.deepseek.com`, and a test-only key. Assert that `call_deepseek_help_chat()` posts to `https://api.deepseek.com/chat/completions`, sends `Authorization: Bearer test-deepseek-key`, selects `deepseek-v4-pro`, keeps the existing system prompt and recent text messages, sets `stream` to false, and returns `choices[0].message.content`.

```python
def test_deepseek_help_chat_uses_configured_model_and_bearer_auth(self):
    with test_env():
        api = load_api()
        request = api.HelpChatRequest(
            messages=[api.HelpChatMessage(role="user", content="CAD STEP 怎么下载？")]
        )
        response = response_mock({"choices": [{"message": {"content": "在任务历史中下载。"}}]})
        with patch.object(api.requests, "post", return_value=response) as post:
            result = api.call_deepseek_help_chat(request)

    self.assertEqual(result, "在任务历史中下载。")
    self.assertEqual(post.call_args.args[0], "https://api.deepseek.com/chat/completions")
    self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer test-deepseek-key")
    self.assertEqual(post.call_args.kwargs["json"]["model"], "deepseek-v4-pro")
    self.assertFalse(post.call_args.kwargs["json"]["stream"])
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
F:\3DAgent\.venv\Scripts\python.exe -m unittest apps.api.test_help_chat_provider
```

Expected: FAIL because `call_deepseek_help_chat` and the dedicated help-chat configuration functions do not exist.

- [ ] **Step 3: Implement minimal DeepSeek configuration and non-streaming call**

Add provider helpers with these contracts:

```python
def help_chat_provider() -> str:
    return runtime_setting_value("HELP_CHAT_PROVIDER", "deepseek").strip().lower() or "deepseek"

def help_chat_model() -> str:
    return runtime_setting_value("HELP_CHAT_MODEL", "deepseek-v4-pro").strip() or "deepseek-v4-pro"

def deepseek_base_url() -> str:
    return runtime_setting_value("DEEPSEEK_BASE_URL", "https://api.deepseek.com").strip().rstrip("/")

def deepseek_help_headers() -> dict[str, str]:
    api_key = env_or_runtime_secret("DEEPSEEK_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="DeepSeek API key is not configured.")
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
```

Build a text-only payload from the current system prompt and the last 16 messages. Use `model=help_chat_model()`, `max_tokens=2048`, `temperature=0.4`, `top_p=0.9`, and `stream=False`. Parse only final string content and map malformed responses to HTTP 502.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: all tests in `test_help_chat_provider` pass.

- [ ] **Step 5: Commit Task 1**

```powershell
git add apps/api/main.py apps/api/test_help_chat_provider.py
git commit -m "Add DeepSeek help chat adapter"
```

### Task 2: Streaming, dispatch, and text-only validation

**Files:**
- Modify: `apps/api/test_help_chat_provider.py`
- Modify: `apps/api/main.py`

- [ ] **Step 1: Write failing streaming and endpoint-dispatch tests**

Add tests whose fake response emits these lines:

```python
[
    b'data: {"choices":[{"delta":{"content":"CAD"}}]}',
    b'data: {"choices":[{"delta":{"content":" 助手"}}]}',
    b'data: [DONE]',
]
```

Assert `"".join(stream_deepseek_help_chat(request)) == "CAD 助手"`, the response is closed, the payload sets `stream=True`, `/api/help-chat` calls the provider-neutral `call_help_chat`, and `/api/help-chat/stream` calls `stream_help_chat`. Add a test asserting image input raises HTTP 400 with a Chinese text-only explanation before any network request.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
F:\3DAgent\.venv\Scripts\python.exe -m unittest apps.api.test_help_chat_provider
```

Expected: FAIL because the DeepSeek stream generator and provider-neutral wrappers do not exist.

- [ ] **Step 3: Implement stream parsing and provider dispatch**

Implement `stream_deepseek_help_chat()` using `requests.post(..., stream=True)` and parse `data:` events until `[DONE]`. Always close the response in `finally`. Add wrappers:

```python
def call_help_chat(request: HelpChatRequest) -> str:
    if help_chat_provider() == "deepseek":
        return call_deepseek_help_chat(request)
    if help_chat_provider() == "mimo":
        return call_mimo_help_chat(request)
    raise HTTPException(status_code=503, detail="Unsupported help chat provider.")

def stream_help_chat(request: HelpChatRequest):
    if help_chat_provider() == "deepseek":
        yield from stream_deepseek_help_chat(request)
        return
    if help_chat_provider() == "mimo":
        yield from stream_mimo_help_chat(request)
        return
    yield "当前帮助助手模型配置无效，请联系管理员。"
```

Wire both endpoints to these wrappers. Reject `request.hasImage` or `request.imageDataUrl` with HTTP 400 before building the DeepSeek payload.

- [ ] **Step 4: Run focused and regression tests**

Run:

```powershell
F:\3DAgent\.venv\Scripts\python.exe -m unittest apps.api.test_help_chat_provider apps.api.test_cadam_generation apps.api.test_admin_api
```

Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit Task 2**

```powershell
git add apps/api/main.py apps/api/test_help_chat_provider.py
git commit -m "Route help chat through DeepSeek"
```

### Task 3: Configuration documentation and full verification

**Files:**
- Modify: `apps/api/.env.example`
- Modify: `apps/api/main.py`
- Test: `apps/api/test_help_chat_provider.py`

- [ ] **Step 1: Add a failing settings visibility test**

Assert `HELP_CHAT_PROVIDER`, `HELP_CHAT_MODEL`, and `DEEPSEEK_BASE_URL` are in `ADMIN_VISIBLE_SETTING_KEYS`, and `DEEPSEEK_API_KEY` remains in `ADMIN_SECRET_KEYS`.

- [ ] **Step 2: Run the focused test and verify RED**

Run the focused unittest command. Expected: FAIL because the new non-secret settings are not yet administrator-visible.

- [ ] **Step 3: Expose safe settings and document environment variables**

Add the three non-secret help-chat settings to `ADMIN_VISIBLE_SETTING_KEYS`. Add these lines to `.env.example` without a real key:

```dotenv
HELP_CHAT_PROVIDER=deepseek
HELP_CHAT_MODEL=deepseek-v4-pro
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=
```

- [ ] **Step 4: Run complete relevant verification**

```powershell
F:\3DAgent\.venv\Scripts\python.exe -m unittest apps.api.test_help_chat_provider apps.api.test_cadam_generation apps.api.test_admin_api apps.api.test_history_persistence
npm run lint
git diff --check
```

Expected: all Python tests pass, frontend lint/type checks exit 0, and `git diff --check` prints no errors.

- [ ] **Step 5: Commit Task 3**

```powershell
git add apps/api/main.py apps/api/.env.example apps/api/test_help_chat_provider.py
git commit -m "Document DeepSeek help chat settings"
```

### Task 4: Production deployment and live smoke test

**Files:**
- Server-only secret update: `/www/wwwroot/3DAgent/apps/api/.env`
- Deploy source: `/www/wwwroot/3DAgent/apps/api/main.py`

- [ ] **Step 1: Upload the verified backend files**

Upload `apps/api/main.py` and the test module to the matching server paths. Do not upload the local example file as production configuration.

- [ ] **Step 2: Update production environment without printing the key**

Set `HELP_CHAT_PROVIDER=deepseek`, `HELP_CHAT_MODEL=deepseek-v4-pro`, `DEEPSEEK_BASE_URL=https://api.deepseek.com`, and `DEEPSEEK_API_KEY` to the supplied secret. Print only `SET(len=N)` when verifying the secret.

- [ ] **Step 3: Run server tests before restart**

```bash
cd /www/wwwroot/3DAgent
./.venv/bin/python -m unittest apps.api.test_help_chat_provider apps.api.test_cadam_generation
```

Expected: all tests pass.

- [ ] **Step 4: Restart FastAPI and verify health**

```bash
systemctl restart 3dagent-api.service
systemctl is-active 3dagent-api.service
curl -fsS https://ai.hhlai.xyz/api/health
```

Expected: service is `active` and health returns HTTP 200 JSON.

- [ ] **Step 5: Run a live DeepSeek help-chat smoke test**

POST one short Chinese CAD help question to `/api/help-chat` and verify HTTP 200, a non-empty Chinese response, and no secret in service logs. Then POST to `/api/help-chat/stream` and verify at least one response chunk.

- [ ] **Step 6: Push the feature branch**

```powershell
git push -u origin codex/deepseek-help-chat
```

Expected: push succeeds and the remote branch tracks `origin/codex/deepseek-help-chat`.
