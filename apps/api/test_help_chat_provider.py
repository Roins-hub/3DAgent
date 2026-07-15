import asyncio
import importlib
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException


def load_api():
    module = importlib.import_module("apps.api.main")
    return importlib.reload(module)


def response_mock(payload, status_code=200):
    response = Mock()
    response.status_code = status_code
    response.json.return_value = payload
    return response


class DeepSeekHelpChatProviderTests(unittest.TestCase):
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
            chunks = list(api.stream_deepseek_help_chat(request))

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
            chunks = list(api.stream_deepseek_help_chat(request))

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
            output = "".join(api.stream_deepseek_help_chat(request))

        self.assertIn("DeepSeek", output)
        self.assertNotIn(api_key, output)
        self.assertNotIn(upstream_body, output)

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
