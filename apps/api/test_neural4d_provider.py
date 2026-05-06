import importlib
import os
import unittest
from unittest.mock import Mock, patch


def test_env(extra_env=None):
    env = {
        "MODEL_PROVIDER": "neural4d",
        "NEURAL4D_API_TOKEN": "test-neural4d-token",
        "NEURAL4D_BASE_URL": "https://alb.neural4d.com:3000/api",
        "NEURAL4D_MODEL_COUNT": "1",
    }
    if extra_env:
        env.update(extra_env)
    return patch.dict(os.environ, env, clear=False)


def load_api():
    module = importlib.import_module("apps.api.main")
    return importlib.reload(module)


def response_mock(payload, status_code=200):
    response = Mock()
    response.status_code = status_code
    response.ok = status_code < 400
    response.text = str(payload)
    response.json.return_value = payload
    return response


class Neural4DProviderTests(unittest.TestCase):
    def test_neural4d_headers_use_bearer_token(self):
        with test_env():
            api = load_api()

            headers = api.neural4d_headers()

        self.assertEqual(headers["Authorization"], "Bearer test-neural4d-token")
        self.assertEqual(headers["Content-Type"], "application/json")

    def test_create_neural4d_text_task_submits_prompt_and_returns_first_uuid(self):
        with test_env({"NEURAL4D_MODEL_COUNT": "1"}):
            api = load_api()
            request = api.CreateJobRequest(
                prompt="Generate a ceramic mug",
                mode="text-to-3d",
                quality="balanced",
                style="game-ready",
                targetFormat="glb",
            )

            with patch.object(
                api.requests,
                "post",
                return_value=response_mock({"uuids": ["uuid-1"]}),
            ) as post:
                task_id = api.create_neural4d_text_task(request)

        self.assertEqual(task_id, "uuid-1")
        post.assert_called_once()
        self.assertEqual(
            post.call_args.args[0],
            "https://alb.neural4d.com:3000/api/generateModelWithText",
        )
        self.assertEqual(
            post.call_args.kwargs["json"],
            {
                "prompt": "Generate a ceramic mug",
                "modelCount": 1,
                "disablePbr": 0,
            },
        )

    def test_retrieve_neural4d_model_maps_completed_result(self):
        with test_env():
            api = load_api()
            payload = {
                "codeStatus": 0,
                "modelUrl": "https://assets.example/model.glb",
                "imageUrl": "https://assets.example/thumb.png",
            }

            with patch.object(
                api.requests,
                "post",
                return_value=response_mock(payload),
            ):
                result = api.retrieve_neural4d_model("uuid-1")

        self.assertEqual(result["codeStatus"], 0)
        self.assertEqual(result["modelUrl"], "https://assets.example/model.glb")
        self.assertEqual(result["imageUrl"], "https://assets.example/thumb.png")

    def test_convert_neural4d_model_returns_url_when_conversion_is_ready(self):
        with test_env():
            api = load_api()

            with patch.object(
                api.requests,
                "post",
                return_value=response_mock(
                    {
                        "statusType": 0,
                        "modelUrl": "https://assets.example/model.obj",
                    }
                ),
            ):
                result = api.convert_neural4d_model("uuid-1", "obj")

        self.assertEqual(result["statusType"], 0)
        self.assertEqual(result["modelUrl"], "https://assets.example/model.obj")


if __name__ == "__main__":
    unittest.main()
