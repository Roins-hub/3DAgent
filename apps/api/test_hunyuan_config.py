import importlib
import os
import unittest
from unittest.mock import patch


def test_env(extra_env=None):
    env = {
        "MODEL_PROVIDER": "hunyuan",
        "TENCENT_TOKENHUB_API_KEY": "tokenhub-key",
    }
    if extra_env:
        env.update(extra_env)
    return patch.dict(os.environ, env, clear=False)


def load_api():
    module = importlib.import_module("apps.api.main")
    return importlib.reload(module)


class HunyuanConfigTests(unittest.TestCase):
    def test_hunyuan_tokenhub_submits_and_queries_with_bearer_key(self):
        with test_env():
            api = load_api()
            request = api.CreateJobRequest(
                prompt="Generate a ceramic mug",
                mode="text-to-3d",
                quality="balanced",
                style="game-ready",
                targetFormat="glb",
            )

            with patch.object(api.requests, "post") as post:
                post.return_value.status_code = 200
                post.return_value.json.return_value = {
                    "id": "job-1",
                    "status": "queued",
                }
                task_id = api.create_hunyuan_task(request)

                post.return_value.json.return_value = {
                    "id": "job-1",
                    "status": "completed",
                    "data": [{"type": "glb", "url": "https://example.test/model.glb"}],
                }
                task = api.query_hunyuan_task("job-1")

        self.assertEqual(task_id, "job-1")
        self.assertEqual(task["status"], "completed")
        self.assertEqual(post.call_count, 2)
        submit_call = post.call_args_list[0]
        self.assertEqual(
            submit_call.args[0],
            "https://tokenhub.tencentmaas.com/v1/api/3d/submit",
        )
        self.assertEqual(
            submit_call.kwargs["headers"]["Authorization"],
            "Bearer tokenhub-key",
        )
        self.assertEqual(
            submit_call.kwargs["json"],
            {
                "model": "hy-3d-3.1",
                "prompt": "Generate a ceramic mug",
                "result_format": "GLB",
                "enable_pbr": True,
            },
        )
        query_call = post.call_args_list[1]
        self.assertEqual(
            query_call.args[0],
            "https://tokenhub.tencentmaas.com/v1/api/3d/query",
        )
        self.assertEqual(
            query_call.kwargs["json"],
            {"model": "hy-3d-3.1", "id": "job-1"},
        )

    def test_hunyuan_model_url_reads_tokenhub_data(self):
        with test_env({"TENCENT_TOKENHUB_API_KEY": "tokenhub-key"}):
            api = load_api()

        self.assertEqual(
            api.model_url_from_hunyuan(
                {
                    "status": "completed",
                    "data": [
                        {"type": "obj", "url": "https://example.test/model.obj"},
                        {"type": "glb", "url": "https://example.test/model.glb"},
                    ],
                }
            ),
            "https://example.test/model.glb",
        )


class ImageProviderTests(unittest.TestCase):
    def test_image_provider_defaults_to_openai_image2(self):
        with test_env({"IMAGE_PROVIDER": ""}):
            api = load_api()

            self.assertEqual(api.selected_image_provider(), "openai")
            self.assertEqual(api.openai_image_model(), "gpt-image-2")

    def test_image_size_maps_aspect_ratio(self):
        with test_env({"IMAGE_PROVIDER": "siliconflow"}):
            api = load_api()

            self.assertEqual(api.image_size_for_aspect_ratio("1:1"), "512x512")
            self.assertEqual(api.image_size_for_aspect_ratio("9:16"), "576x1024")
            self.assertEqual(api.image_size_for_aspect_ratio("16:9"), "1024x576")

    def test_siliconflow_payload_uses_prompt_model_and_size(self):
        with test_env(
            {
                "IMAGE_PROVIDER": "siliconflow",
                "SILICONFLOW_API_KEY": "test-key",
                "SILICONFLOW_IMAGE_MODEL": "black-forest-labs/FLUX.1-schnell",
            }
        ):
            api = load_api()
            request = api.CreateImageJobRequest(
                prompt="生成一个赛博朋克台灯",
                aspectRatio="16:9",
            )

            payload = api.siliconflow_image_payload(request, seed=42)

        self.assertEqual(payload["model"], "black-forest-labs/FLUX.1-schnell")
        self.assertEqual(payload["prompt"], "生成一个赛博朋克台灯")
        self.assertEqual(payload["image_size"], "1024x576")
        self.assertEqual(payload["seed"], 42)
        self.assertEqual(payload["output_format"], "png")

    def test_siliconflow_payload_defaults_to_kolors(self):
        with test_env(
            {
                "IMAGE_PROVIDER": "siliconflow",
                "SILICONFLOW_API_KEY": "test-key",
                "SILICONFLOW_IMAGE_MODEL": "",
            }
        ):
            api = load_api()
            request = api.CreateImageJobRequest(
                prompt="生成一只狗",
                aspectRatio="1:1",
            )

            payload = api.siliconflow_image_payload(request)

        self.assertEqual(payload["model"], "Kwai-Kolors/Kolors")


if __name__ == "__main__":
    unittest.main()
