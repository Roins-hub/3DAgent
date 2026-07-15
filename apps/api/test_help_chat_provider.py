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
            hasImage=True,
            imageDataUrl="data:image/png;base64,ignored",
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
                return_value=response_mock(
                    {"choices": [{"message": {"content": "  DeepSeek answer  "}}]}
                ),
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
                    {"role": "system", "content": api.help_system_prompt()},
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
        self.assertNotIn("cadam-secret", raised.exception.detail)

    def test_call_deepseek_help_chat_maps_malformed_response_to_502(self):
        api = load_api()
        request = api.HelpChatRequest(
            messages=[{"role": "user", "content": "Help"}],
        )
        malformed = {"choices": [{"message": {"content": []}}]}

        with (
            patch.object(api, "deepseek_help_headers", return_value={}),
            patch.object(api.requests, "post", return_value=response_mock(malformed)),
        ):
            with self.assertRaises(HTTPException) as raised:
                api.call_deepseek_help_chat(request)

        self.assertEqual(raised.exception.status_code, 502)
        self.assertNotIn(str(malformed), raised.exception.detail)


if __name__ == "__main__":
    unittest.main()
