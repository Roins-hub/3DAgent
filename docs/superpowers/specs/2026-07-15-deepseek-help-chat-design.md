# DeepSeek Help Chat Design

## Goal

Replace the CAD help assistant's current MiMo chat backend with DeepSeek while preserving the existing user interface, streaming responses, conversation context, and Chinese system prompt.

## Scope

- The `/api/help-chat` and `/api/help-chat/stream` endpoints use DeepSeek.
- The selected model is `deepseek-v4-pro`.
- CAD generation, image generation, 3D generation, Supabase, and authentication remain unchanged.
- The API key stays in runtime configuration and is never committed.

## Configuration

The help assistant uses dedicated settings so it does not depend on CADAM provider choices:

- `HELP_CHAT_PROVIDER=deepseek`
- `HELP_CHAT_MODEL=deepseek-v4-pro`
- `DEEPSEEK_BASE_URL=https://api.deepseek.com`
- `DEEPSEEK_API_KEY` is stored server-side and omitted from source control.

The server reads secrets through the existing environment/runtime-secret helpers. The DeepSeek request uses `Authorization: Bearer <key>` and the OpenAI-compatible `/chat/completions` endpoint.

## Request Flow

1. The frontend sends the existing help-chat request without API changes.
2. FastAPI builds the existing Chinese system prompt and recent conversation messages.
3. The provider adapter sends an OpenAI-compatible DeepSeek request using `deepseek-v4-pro`.
4. Non-streaming calls return the first final assistant message.
5. Streaming calls parse server-sent `data:` events and yield `delta.content` until `[DONE]`.

Image input is rejected with a clear Chinese message because this integration is text-only. No image data is forwarded to DeepSeek.

## Error Handling

- Missing key: return HTTP 503 with a configuration message.
- Network failure, timeout, or upstream HTTP error: return/yield a concise Chinese service error without exposing the key or upstream response body.
- Invalid JSON, missing choices, or empty content: return HTTP 502.
- Streaming responses are always closed after completion or failure.

## Testing

Focused backend tests will verify:

- DeepSeek URL, model, Bearer header, and request payload.
- `deepseek-v4-pro` is selected from configuration.
- Non-streaming response extraction.
- Streaming SSE delta extraction and `[DONE]` handling.
- Missing key and text-only image behavior.

After automated tests pass, deploy the API change, write the supplied key only to the server environment, restart `3dagent-api.service`, and run a live help-chat smoke test.
