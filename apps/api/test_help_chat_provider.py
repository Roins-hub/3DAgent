import asyncio
import importlib
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient


def load_api():
    module = importlib.import_module("apps.api.main")
    return importlib.reload(module)


def response_mock(payload, status_code=200):
    response = Mock()
    response.status_code = status_code
    response.json.return_value = payload
    return response


async def asgi_post(
    api,
    path,
    payload,
    *,
    disconnect_after_first_chunk=False,
    disconnect_after_event=None,
):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    messages = []
    request_sent = False
    first_chunk_sent = asyncio.Event()

    async def receive():
        nonlocal request_sent
        if not request_sent:
            request_sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        if disconnect_after_first_chunk:
            await first_chunk_sent.wait()
            return {"type": "http.disconnect"}
        if disconnect_after_event is not None:
            await asyncio.to_thread(disconnect_after_event.wait)
            return {"type": "http.disconnect"}
        await asyncio.Event().wait()

    async def send(message):
        messages.append(message)
        if (
            disconnect_after_first_chunk
            and message["type"] == "http.response.body"
            and message.get("body")
        ):
            first_chunk_sent.set()

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "root_path": "",
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode("ascii")),
        ],
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
    }
    error = None
    try:
        await api.app(scope, receive, send)
    except BaseException as exc:
        error = exc
    return messages, error


async def collect_async_stream(stream):
    return [chunk async for chunk in stream]


def put_admin_setting(api, setting):
    posted_rows = []

    def fake_admin_request(method, path, **kwargs):
        if method == "POST" and path == "admin_settings":
            posted_rows.extend(kwargs["json_body"])
            return response_mock([])
        if method == "POST" and path == "admin_audit_logs":
            return response_mock([])
        if method == "GET" and path.startswith("admin_settings?"):
            return response_mock(posted_rows)
        raise AssertionError((method, path))

    with tempfile.TemporaryDirectory() as temp_dir:
        api.API_ENV_PATH = Path(temp_dir) / ".env"
        api.API_ENV_PATH.write_text(
            "DEEPSEEK_API_KEY=existing-deepseek-key\n",
            encoding="utf-8",
        )
        with (
            patch.object(
                api,
                "verify_admin_user",
                return_value=api.AuthUser(id="admin-1", email="admin@example.com"),
            ),
            patch.object(api, "supabase_admin_request", side_effect=fake_admin_request),
        ):
            response = TestClient(api.app).put(
                "/api/admin/settings",
                json={"settings": [setting]},
            )
        env_text = api.API_ENV_PATH.read_text(encoding="utf-8")

    return response, posted_rows, env_text


class DeepSeekHelpChatProviderTests(unittest.TestCase):
    def test_admin_settings_expose_safe_help_chat_config_and_redact_secret(self):
        api = load_api()

        self.assertTrue(
            {
                "HELP_CHAT_PROVIDER",
                "HELP_CHAT_MODEL",
                "DEEPSEEK_BASE_URL",
            }.issubset(api.ADMIN_VISIBLE_SETTING_KEYS)
        )
        self.assertTrue(
            {
                "HELP_CHAT_PROVIDER",
                "HELP_CHAT_MODEL",
                "DEEPSEEK_BASE_URL",
            }.isdisjoint(api.ADMIN_SECRET_KEYS)
        )
        self.assertIn("DEEPSEEK_API_KEY", api.ADMIN_SECRET_KEYS)

        secret = api.admin_setting_view(
            {
                "key": "DEEPSEEK_API_KEY",
                "value": "deepseek-test-secret",
                "is_secret": False,
                "updated_at": None,
            }
        )

        self.assertTrue(secret.isSecret)
        self.assertTrue(secret.isConfigured)
        serialized = api.AdminSettingsResponse(settings=[secret]).model_dump(mode="json")
        self.assertIsNone(serialized["settings"][0]["value"])

    def test_admin_settings_round_trip_preserves_hidden_deepseek_key(self):
        api = load_api()
        stored = {
            "HELP_CHAT_MODEL": {
                "key": "HELP_CHAT_MODEL",
                "value": "deepseek-v4-pro",
                "is_secret": False,
                "updated_at": None,
            },
            "DEEPSEEK_API_KEY": {
                "key": "DEEPSEEK_API_KEY",
                "value": "existing-deepseek-key",
                "is_secret": True,
                "updated_at": None,
            },
        }

        def fake_admin_request(method, path, **kwargs):
            if method == "GET" and path.startswith("admin_settings?"):
                return response_mock(list(stored.values()))
            if method == "POST" and path == "admin_settings":
                for row in kwargs["json_body"]:
                    stored[row["key"]] = dict(row)
                return response_mock([])
            if method == "POST" and path == "admin_audit_logs":
                return response_mock([])
            raise AssertionError((method, path))

        with tempfile.TemporaryDirectory() as temp_dir:
            api.API_ENV_PATH = Path(temp_dir) / ".env"
            api.API_ENV_PATH.write_text(
                "HELP_CHAT_MODEL=deepseek-v4-pro\n"
                "DEEPSEEK_API_KEY=existing-deepseek-key\n",
                encoding="utf-8",
            )
            with (
                patch.object(
                    api,
                    "verify_admin_user",
                    return_value=api.AuthUser(id="admin-1", email="admin@example.com"),
                ),
                patch.object(api, "supabase_admin_request", side_effect=fake_admin_request),
            ):
                client = TestClient(api.app)
                get_response = client.get("/api/admin/settings")
                config = get_response.json()
                deepseek_key = next(
                    item
                    for item in config["settings"]
                    if item["key"] == "DEEPSEEK_API_KEY"
                )
                self.assertIsNone(deepseek_key["value"])

                next_model = next(
                    item
                    for item in config["settings"]
                    if item["key"] == "HELP_CHAT_MODEL"
                )
                next_model["value"] = "deepseek-v4-pro-next"
                put_response = client.put(
                    "/api/admin/settings",
                    json={"settings": config["settings"]},
                )
            env_text = api.API_ENV_PATH.read_text(encoding="utf-8")

        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(put_response.status_code, 200)
        self.assertEqual(stored["HELP_CHAT_MODEL"]["value"], "deepseek-v4-pro-next")
        self.assertEqual(stored["DEEPSEEK_API_KEY"]["value"], "existing-deepseek-key")
        self.assertIn("DEEPSEEK_API_KEY=existing-deepseek-key", env_text)

    def test_admin_settings_put_updates_nonempty_deepseek_key(self):
        api = load_api()
        response, posted_rows, env_text = put_admin_setting(
            api,
            {
                "key": "DEEPSEEK_API_KEY",
                "value": "replacement-deepseek-key",
                "isSecret": True,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            next(row for row in posted_rows if row["key"] == "DEEPSEEK_API_KEY")["value"],
            "replacement-deepseek-key",
        )
        self.assertIn("DEEPSEEK_API_KEY=replacement-deepseek-key", env_text)

    def test_admin_settings_put_clears_empty_deepseek_key(self):
        api = load_api()
        response, posted_rows, env_text = put_admin_setting(
            api,
            {
                "key": "DEEPSEEK_API_KEY",
                "value": "",
                "isSecret": True,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(posted_rows), 1)
        self.assertEqual(posted_rows[0]["value"], "")
        self.assertIn("DEEPSEEK_API_KEY=\n", env_text)

    def test_admin_settings_put_treats_whitespace_deepseek_key_as_clear(self):
        api = load_api()
        response, posted_rows, env_text = put_admin_setting(
            api,
            {
                "key": "DEEPSEEK_API_KEY",
                "value": "   ",
                "isSecret": True,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(posted_rows), 1)
        self.assertEqual(posted_rows[0]["value"], "")
        self.assertIn("DEEPSEEK_API_KEY=\n", env_text)

    def test_dedicated_help_chat_settings_and_key_are_used(self):
        api = load_api()
        settings = {
            "HELP_CHAT_PROVIDER": " DeepSeek ",
            "HELP_CHAT_MODEL": "deepseek-help-test",
            "DEEPSEEK_BASE_URL": "https://deepseek.example/v1/",
            "DEEPSEEK_API_KEY": "help-secret",
            "CADAM_DEEPSEEK_API_KEY": "cadam-secret",
        }

        with patch.object(
            api,
            "runtime_setting_value",
            side_effect=lambda key, default="": settings.get(key, default),
        ):
            self.assertEqual(api.help_chat_provider(), "deepseek")
            self.assertEqual(api.help_chat_model(), "deepseek-help-test")
            self.assertEqual(api.deepseek_base_url(), "https://deepseek.example/v1")
            self.assertEqual(
                api.deepseek_help_headers(),
                {
                    "Authorization": "Bearer help-secret",
                    "Content-Type": "application/json",
                },
            )

    def test_call_deepseek_help_chat_posts_text_payload_and_parses_response(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[
                *[
                    {"role": "user", "content": f" old {index} "}
                    for index in range(2)
                ],
                *[
                    {
                        "role": "assistant" if index % 2 else "user",
                        "content": f" message {index} ",
                    }
                    for index in range(16)
                ],
            ],
            selectedTool="writePrompt",
        )
        response = response_mock(
            {"choices": [{"message": {"content": "  DeepSeek answer  "}}]}
        )

        with (
            patch.object(api, "help_chat_model", return_value="deepseek-v4-pro"),
            patch.object(api, "deepseek_base_url", return_value="https://api.deepseek.test"),
            patch.object(
                api,
                "deepseek_help_headers",
                return_value={
                    "Authorization": "Bearer help-key",
                    "Content-Type": "application/json",
                },
            ),
            patch.object(
                api.requests,
                "post",
                return_value=response,
            ) as post,
        ):
            result = api.call_deepseek_help_chat(request)

        self.assertEqual(result, "DeepSeek answer")
        post.assert_called_once()
        self.assertEqual(
            post.call_args.args[0],
            "https://api.deepseek.test/chat/completions",
        )
        self.assertEqual(
            post.call_args.kwargs["headers"]["Authorization"],
            "Bearer help-key",
        )
        payload = post.call_args.kwargs["json"]
        self.assertEqual(
            payload,
            {
                "model": "deepseek-v4-pro",
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            api.help_system_prompt()
                            + "\n用户当前选择的输入工具是：writePrompt。"
                        ),
                    },
                    *[
                        {
                            "role": "assistant" if index % 2 else "user",
                            "content": f"message {index}",
                        }
                        for index in range(16)
                    ],
                ],
                "max_tokens": 2048,
                "temperature": 0.4,
                "top_p": 0.9,
                "stream": False,
            },
        )
        self.assertNotIn("stream", post.call_args.kwargs)
        response.raise_for_status.assert_called_once_with()
        response.close.assert_called_once_with()

    def test_deepseek_help_headers_requires_dedicated_key(self):
        api = load_api()

        with patch.object(
            api,
            "runtime_setting_value",
            side_effect=lambda key, default="": (
                "cadam-secret" if key == "CADAM_DEEPSEEK_API_KEY" else default
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                api.deepseek_help_headers()

        self.assertEqual(raised.exception.status_code, 503)
        self.assertRegex(raised.exception.detail, "[\\u4e00-\\u9fff]")
        self.assertNotIn("cadam-secret", raised.exception.detail)

    def test_call_deepseek_help_chat_maps_malformed_response_to_502(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )
        malformed = {"choices": [{"message": {"content": []}}]}
        response = response_mock(malformed)

        with (
            patch.object(api, "deepseek_help_headers", return_value={}),
            patch.object(api.requests, "post", return_value=response),
        ):
            with self.assertRaises(HTTPException) as raised:
                api.call_deepseek_help_chat(request)

        self.assertEqual(raised.exception.status_code, 502)
        self.assertRegex(raised.exception.detail, "[\\u4e00-\\u9fff]")
        self.assertNotIn(str(malformed), raised.exception.detail)
        response.close.assert_called_once_with()

    def test_call_deepseek_help_chat_maps_timeout_to_sanitized_503(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )
        api_key = "test-deepseek-key"
        upstream_body = "upstream timeout body"

        with (
            patch.object(
                api,
                "deepseek_help_headers",
                return_value={"Authorization": f"Bearer {api_key}"},
            ),
            patch.object(
                api.requests,
                "post",
                side_effect=api.requests.Timeout(f"{upstream_body} {api_key}"),
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                api.call_deepseek_help_chat(request)

        self.assertEqual(raised.exception.status_code, 503)
        self.assertRegex(raised.exception.detail, "[\\u4e00-\\u9fff]")
        self.assertNotIn(api_key, raised.exception.detail)
        self.assertNotIn(upstream_body, raised.exception.detail)
        self.assertNotIn(api_key, str(raised.exception))
        self.assertNotIn(upstream_body, str(raised.exception))

    def test_call_deepseek_help_chat_maps_http_error_to_sanitized_502(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )
        api_key = "test-deepseek-key"
        upstream_body = "upstream rate-limit body"
        response = response_mock(
            {"choices": [{"message": {"content": "must not return"}}]}
        )
        response.raise_for_status.side_effect = api.requests.HTTPError(
            f"{upstream_body} {api_key}"
        )

        with (
            patch.object(
                api,
                "deepseek_help_headers",
                return_value={"Authorization": f"Bearer {api_key}"},
            ),
            patch.object(
                api.requests,
                "post",
                return_value=response,
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                api.call_deepseek_help_chat(request)

        self.assertEqual(raised.exception.status_code, 502)
        self.assertRegex(raised.exception.detail, "[\\u4e00-\\u9fff]")
        self.assertNotIn(api_key, raised.exception.detail)
        self.assertNotIn(upstream_body, raised.exception.detail)
        response.raise_for_status.assert_called_once_with()
        response.close.assert_called_once_with()

    def test_call_deepseek_help_chat_maps_invalid_json_to_sanitized_502(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )
        api_key = "test-deepseek-key"
        upstream_body = "not-json upstream body"
        response = response_mock(None)
        response.text = upstream_body
        response.json.side_effect = ValueError(upstream_body)

        with (
            patch.object(
                api,
                "deepseek_help_headers",
                return_value={"Authorization": f"Bearer {api_key}"},
            ),
            patch.object(api.requests, "post", return_value=response),
        ):
            with self.assertRaises(HTTPException) as raised:
                api.call_deepseek_help_chat(request)

        self.assertEqual(raised.exception.status_code, 502)
        self.assertRegex(raised.exception.detail, "[\\u4e00-\\u9fff]")
        self.assertNotIn(api_key, raised.exception.detail)
        self.assertNotIn(upstream_body, raised.exception.detail)
        response.close.assert_called_once_with()

    def test_call_deepseek_help_chat_maps_empty_choices_to_sanitized_502(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )
        api_key = "test-deepseek-key"
        upstream_body = "empty choices upstream body"
        response = response_mock({"choices": []})
        response.text = upstream_body

        with (
            patch.object(
                api,
                "deepseek_help_headers",
                return_value={"Authorization": f"Bearer {api_key}"},
            ),
            patch.object(api.requests, "post", return_value=response),
        ):
            with self.assertRaises(HTTPException) as raised:
                api.call_deepseek_help_chat(request)

        self.assertEqual(raised.exception.status_code, 502)
        self.assertRegex(raised.exception.detail, "[\\u4e00-\\u9fff]")
        self.assertNotIn(api_key, raised.exception.detail)
        self.assertNotIn(upstream_body, raised.exception.detail)
        response.close.assert_called_once_with()

    def test_stream_deepseek_help_chat_parses_data_events_and_closes_response(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "CAD 参数怎么填？"}],
        )
        response = Mock()
        response.iter_lines.return_value = iter(
            [
                b"",
                b"event: message",
                b'data: {"choices":[{"delta":{"content":"CAD"}}]}',
                b"id: ignored",
                b'data: {"choices":[{"delta":{"content":""}}]}',
                b'data: {"choices":[{"delta":{"content":" \xe5\x8a\xa9\xe6\x89\x8b"}}]}',
                b"data: [DONE]",
                b'data: {"choices":[{"delta":{"content":"ignored"}}]}',
            ]
        )

        with (
            patch.object(api, "deepseek_base_url", return_value="https://api.deepseek.test"),
            patch.object(
                api,
                "deepseek_help_headers",
                return_value={"Authorization": "Bearer help-key"},
            ),
            patch.object(api.requests, "post", return_value=response) as post,
        ):
            chunks = asyncio.run(
                collect_async_stream(api.stream_deepseek_help_chat(request))
            )

        self.assertEqual(chunks, ["CAD", " 助手"])
        post.assert_called_once()
        self.assertEqual(
            post.call_args.args[0],
            "https://api.deepseek.test/chat/completions",
        )
        self.assertTrue(post.call_args.kwargs["stream"])
        self.assertTrue(post.call_args.kwargs["json"]["stream"])
        response.close.assert_called_once_with()

    def test_stream_deepseek_help_chat_closes_http_error_and_sanitizes_output(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )
        api_key = "test-deepseek-key"
        upstream_body = "upstream rate-limit body"
        response = Mock()
        response.raise_for_status.side_effect = api.requests.HTTPError(
            f"{upstream_body} {api_key}"
        )

        with (
            patch.object(
                api,
                "deepseek_help_headers",
                return_value={"Authorization": f"Bearer {api_key}"},
            ),
            patch.object(api.requests, "post", return_value=response),
        ):
            chunks = asyncio.run(
                collect_async_stream(api.stream_deepseek_help_chat(request))
            )

        output = "".join(chunks)
        self.assertIn("DeepSeek", output)
        self.assertNotIn(api_key, output)
        self.assertNotIn(upstream_body, output)
        response.close.assert_called_once_with()

    def test_stream_deepseek_help_chat_sanitizes_connection_error(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )
        api_key = "test-deepseek-key"
        upstream_body = "upstream connection body"

        with (
            patch.object(
                api,
                "deepseek_help_headers",
                return_value={"Authorization": f"Bearer {api_key}"},
            ),
            patch.object(
                api.requests,
                "post",
                side_effect=api.requests.ConnectionError(f"{upstream_body} {api_key}"),
            ),
        ):
            output = "".join(
                asyncio.run(
                    collect_async_stream(api.stream_deepseek_help_chat(request))
                )
            )

        self.assertIn("DeepSeek", output)
        self.assertNotIn(api_key, output)
        self.assertNotIn(upstream_body, output)

    def test_stream_deepseek_help_chat_closes_when_iter_lines_raises(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )
        api_key = "test-deepseek-key"
        upstream_body = "broken stream body"
        response = Mock()

        def broken_lines():
            yield b'data: {"choices":[{"delta":{"content":"first"}}]}'
            raise api.requests.ConnectionError(f"{upstream_body} {api_key}")

        response.iter_lines.return_value = broken_lines()

        with (
            patch.object(
                api,
                "deepseek_help_headers",
                return_value={"Authorization": f"Bearer {api_key}"},
            ),
            patch.object(api.requests, "post", return_value=response),
        ):
            chunks = asyncio.run(
                collect_async_stream(api.stream_deepseek_help_chat(request))
            )

        output = "".join(chunks)
        self.assertEqual(chunks[0], "first")
        self.assertNotIn(api_key, output)
        self.assertNotIn(upstream_body, output)
        response.close.assert_called_once_with()

    def test_stream_mimo_help_chat_closes_http_error_and_sanitizes_output(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )
        api_key = "test-mimo-key"
        upstream_url = "https://api.mimo.test/chat/completions"
        upstream_body = "upstream rate-limit body"
        response = Mock()
        response.raise_for_status.side_effect = api.requests.HTTPError(
            f"403 for {upstream_url}: {upstream_body} {api_key}"
        )

        with (
            patch.object(
                api,
                "mimo_headers",
                return_value={"api-key": api_key},
            ),
            patch.object(api.requests, "post", return_value=response),
        ):
            output = "".join(api.stream_mimo_help_chat(request))

        self.assertRegex(output, "[\\u4e00-\\u9fff]")
        self.assertNotIn(api_key, output)
        self.assertNotIn(upstream_url, output)
        self.assertNotIn(upstream_body, output)
        response.close.assert_called_once_with()

    def test_stream_mimo_help_chat_closes_iter_lines_error_and_sanitizes_output(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )
        api_key = "test-mimo-key"
        upstream_url = "https://api.mimo.test/chat/completions"
        upstream_body = "broken stream body"
        response = Mock()

        def broken_lines():
            yield b'data: {"choices":[{"delta":{"content":"first"}}]}'
            raise api.requests.ConnectionError(
                f"stream failed for {upstream_url}: {upstream_body} {api_key}"
            )

        response.iter_lines.return_value = broken_lines()

        with (
            patch.object(
                api,
                "mimo_headers",
                return_value={"api-key": api_key},
            ),
            patch.object(api.requests, "post", return_value=response),
        ):
            chunks = list(api.stream_mimo_help_chat(request))

        output = "".join(chunks)
        self.assertEqual(chunks[0], "first")
        self.assertRegex(chunks[-1], "[\\u4e00-\\u9fff]")
        self.assertNotIn(api_key, output)
        self.assertNotIn(upstream_url, output)
        self.assertNotIn(upstream_body, output)
        response.close.assert_called_once_with()

    def test_help_chat_stream_provider_lookup_does_not_block_event_loop(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )
        lookup_started = threading.Event()
        release_lookup = threading.Event()
        ticker_ran = threading.Event()
        ticker_seen_during_lookup = []

        def slow_provider_lookup():
            lookup_started.set()
            release_lookup.wait(timeout=0.5)
            ticker_seen_during_lookup.append(ticker_ran.is_set())
            return "unknown"

        async def run_scenario():
            async def ticker():
                await asyncio.to_thread(lookup_started.wait, 0.2)
                ticker_ran.set()
                release_lookup.set()

            response, _ = await asyncio.gather(
                api.help_chat_stream(request),
                ticker(),
            )
            return response

        with patch.object(api, "help_chat_provider", side_effect=slow_provider_lookup):
            response = asyncio.run(run_scenario())

        self.assertTrue(ticker_seen_during_lookup[0])
        self.assertEqual(response.media_type, "text/plain; charset=utf-8")

    def test_help_chat_stream_missing_key_returns_503_before_response_start(self):
        api = load_api()
        payload = {"messages": [{"role": "user", "content": "Help"}]}

        with (
            patch.object(api, "help_chat_provider", return_value="deepseek"),
            patch.object(
                api,
                "runtime_setting_value",
                side_effect=lambda key, default="": "" if key == "DEEPSEEK_API_KEY" else default,
            ),
            patch.object(api.requests, "post") as post,
        ):
            messages, error = asyncio.run(
                asgi_post(api, "/api/help-chat/stream", payload)
            )

        self.assertIsNone(error)
        start = next(message for message in messages if message["type"] == "http.response.start")
        response_body = b"".join(
            message.get("body", b"")
            for message in messages
            if message["type"] == "http.response.body"
        )
        detail = json.loads(response_body)["detail"]
        self.assertEqual(start["status"], 503)
        self.assertRegex(detail, "[\\u4e00-\\u9fff]")
        post.assert_not_called()

    def test_help_chat_stream_disconnect_closes_upstream_response(self):
        api = load_api()
        payload = {"messages": [{"role": "user", "content": "Help"}]}
        close_event = threading.Event()
        response = Mock()

        class Lines:
            def __init__(self):
                self.index = 0

            def __iter__(self):
                return self

            def __next__(self):
                self.index += 1
                if self.index == 1:
                    return b'data: {"choices":[{"delta":{"content":"first"}}]}'
                close_event.wait(timeout=1)
                raise StopIteration

        response.iter_lines.return_value = Lines()
        response.close.side_effect = close_event.set

        with (
            patch.object(api, "help_chat_provider", return_value="deepseek"),
            patch.object(api, "deepseek_help_headers", return_value={}),
            patch.object(api.requests, "post", return_value=response),
        ):
            messages, error = asyncio.run(
                asgi_post(
                    api,
                    "/api/help-chat/stream",
                    payload,
                    disconnect_after_first_chunk=True,
                )
            )

        self.assertIsNone(error)
        chunks = [
            message.get("body", b"")
            for message in messages
            if message["type"] == "http.response.body" and message.get("body")
        ]
        self.assertIn(b"first", chunks)
        response.close.assert_called_once_with()

    def test_help_chat_stream_disconnect_closes_response_returned_late_from_post(self):
        api = load_api()
        payload = {"messages": [{"role": "user", "content": "Help"}]}
        post_started = threading.Event()
        release_post = threading.Event()
        close_event = threading.Event()
        response = Mock()
        response.close.side_effect = close_event.set

        def blocking_post(*args, **kwargs):
            post_started.set()
            release_post.wait(timeout=2)
            return response

        async def run_scenario():
            messages, error = await asgi_post(
                api,
                "/api/help-chat/stream",
                payload,
                disconnect_after_event=post_started,
            )
            closed_before_post_returned = close_event.is_set()
            release_post.set()
            closed_after_post_returned = await asyncio.to_thread(
                close_event.wait,
                1,
            )
            return messages, error, closed_before_post_returned, closed_after_post_returned

        with (
            patch.object(api, "help_chat_provider", return_value="deepseek"),
            patch.object(api, "deepseek_help_headers", return_value={}),
            patch.object(api.requests, "post", side_effect=blocking_post) as post,
        ):
            messages, error, closed_before, closed_after = asyncio.run(run_scenario())

        self.assertIsNone(error)
        self.assertFalse(closed_before)
        self.assertTrue(closed_after)
        self.assertEqual(
            next(
                message["status"]
                for message in messages
                if message["type"] == "http.response.start"
            ),
            200,
        )
        post.assert_called_once()
        response.close.assert_called_once_with()

    def test_call_help_chat_dispatches_supported_providers_and_rejects_unknown(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )

        for provider, adapter_name in (
            ("deepseek", "call_deepseek_help_chat"),
            ("mimo", "call_mimo_help_chat"),
        ):
            with self.subTest(provider=provider):
                with (
                    patch.object(api, "help_chat_provider", return_value=provider),
                    patch.object(api, adapter_name, return_value=f"{provider}-reply") as adapter,
                ):
                    result = api.call_help_chat(request)

                self.assertEqual(result, f"{provider}-reply")
                adapter.assert_called_once_with(request)

        with patch.object(api, "help_chat_provider", return_value="unknown"):
            with self.assertRaises(HTTPException) as raised:
                api.call_help_chat(request)

        self.assertEqual(raised.exception.status_code, 503)
        self.assertRegex(raised.exception.detail, "[\\u4e00-\\u9fff]")

    def test_stream_help_chat_dispatches_supported_providers_and_handles_unknown(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )

        for provider, adapter_name in (
            ("deepseek", "stream_deepseek_help_chat"),
            ("mimo", "stream_mimo_help_chat"),
        ):
            with self.subTest(provider=provider):
                with (
                    patch.object(api, "help_chat_provider", return_value=provider),
                    patch.object(api, adapter_name, return_value=iter([provider])) as adapter,
                ):
                    chunks = list(api.stream_help_chat(request))

                self.assertEqual(chunks, [provider])
                adapter.assert_called_once_with(request)

        with patch.object(api, "help_chat_provider", return_value="unknown"):
            chunks = list(api.stream_help_chat(request))

        self.assertEqual(len(chunks), 1)
        self.assertRegex(chunks[0], "[\\u4e00-\\u9fff]")

    def test_help_chat_endpoints_use_provider_neutral_wrappers(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )

        with patch.object(api, "call_help_chat", return_value="neutral reply") as call:
            response = asyncio.run(api.help_chat(request))

        self.assertEqual(response.message, "neutral reply")
        call.assert_called_once_with(request)

        with patch.object(api, "stream_help_chat", return_value=iter(["neutral chunk"])) as stream:
            response = asyncio.run(api.help_chat_stream(request))

        self.assertEqual(response.media_type, "text/plain; charset=utf-8")
        stream.assert_called_once_with(request)

    def test_deepseek_images_are_rejected_before_network_but_mimo_is_preserved(self):
        api = load_api()
        image_request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "看图回答"}],
            hasImage=True,
            imageDataUrl="data:image/png;base64,aGVscA==",
        )

        with (
            patch.object(api, "help_chat_provider", return_value="deepseek"),
            patch.object(api.requests, "post") as post,
        ):
            with self.assertRaises(HTTPException) as call_raised:
                api.call_help_chat(image_request)
            with self.assertRaises(HTTPException) as stream_raised:
                list(api.stream_help_chat(image_request))
            with self.assertRaises(HTTPException) as endpoint_raised:
                asyncio.run(api.help_chat_stream(image_request))

        for raised in (call_raised, stream_raised, endpoint_raised):
            self.assertEqual(raised.exception.status_code, 400)
            self.assertIn("DeepSeek", raised.exception.detail)
            self.assertIn("图片", raised.exception.detail)
        post.assert_not_called()

        with (
            patch.object(api, "help_chat_provider", return_value="mimo"),
            patch.object(api, "call_mimo_help_chat", return_value="vision reply") as mimo,
        ):
            result = api.call_help_chat(image_request)

        self.assertEqual(result, "vision reply")
        mimo.assert_called_once_with(image_request)

        with (
            patch.object(api, "help_chat_provider", return_value="mimo"),
            patch.object(
                api,
                "stream_mimo_help_chat",
                return_value=iter(["vision chunk"]),
            ) as mimo_stream,
        ):
            chunks = list(api.stream_help_chat(image_request))

        self.assertEqual(chunks, ["vision chunk"])
        mimo_stream.assert_called_once_with(image_request)

    def test_deepseek_image_data_url_without_flag_is_rejected_before_network(self):
        api = load_api()
        image_request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "看图回答"}],
            imageDataUrl="data:image/png;base64,aGVscA==",
        )

        with (
            patch.object(api, "help_chat_provider", return_value="deepseek"),
            patch.object(api.requests, "post") as post,
        ):
            with self.assertRaises(HTTPException) as call_raised:
                api.call_help_chat(image_request)
            with self.assertRaises(HTTPException) as stream_raised:
                api.stream_help_chat(image_request)

        for raised in (call_raised, stream_raised):
            self.assertEqual(raised.exception.status_code, 400)
            self.assertIn("图片", raised.exception.detail)
        post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
