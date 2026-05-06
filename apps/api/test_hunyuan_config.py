import importlib
import os
import unittest
from unittest.mock import patch


def test_env(extra_env=None):
    env = {
        "MODEL_PROVIDER": "hunyuan",
        "TENCENTCLOUD_SECRET_ID": "test-secret-id",
        "TENCENTCLOUD_SECRET_KEY": "test-secret-key",
    }
    if extra_env:
        env.update(extra_env)
    return patch.dict(os.environ, env, clear=False)


def load_api():
    module = importlib.import_module("apps.api.main")
    return importlib.reload(module)


class HunyuanConfigTests(unittest.TestCase):
    def test_hunyuan_defaults_to_domestic_endpoint(self):
        with test_env():
            api = load_api()
            config = api.tencent_ai3d_config()

        self.assertEqual(config.host, "ai3d.tencentcloudapi.com")
        self.assertEqual(config.endpoint, "https://ai3d.tencentcloudapi.com")
        self.assertEqual(config.service, "ai3d")
        self.assertEqual(config.version, "2025-05-13")
        self.assertEqual(config.region, "ap-guangzhou")

    def test_hunyuan_can_use_international_profile(self):
        with test_env(
            {
                "TENCENTCLOUD_HUNYUAN_PROFILE": "international",
                "TENCENTCLOUD_REGION": "ap-singapore",
            }
        ):
            api = load_api()
            config = api.tencent_ai3d_config()

        self.assertEqual(config.host, "hunyuan.intl.tencentcloudapi.com")
        self.assertEqual(config.endpoint, "https://hunyuan.intl.tencentcloudapi.com")
        self.assertEqual(config.service, "hunyuan")
        self.assertEqual(config.version, "2023-09-01")
        self.assertEqual(config.region, "ap-singapore")

    def test_hunyuan_uses_configured_standard_actions(self):
        with test_env():
            api = load_api()
            request = api.CreateJobRequest(
                prompt="Generate a ceramic mug",
                mode="text-to-3d",
                quality="balanced",
                style="game-ready",
                targetFormat="glb",
            )

            with patch.object(
                api,
                "call_tencent_ai3d",
                return_value={"JobId": "job-1"},
            ) as submit:
                task_id = api.create_hunyuan_task(request)

            with patch.object(
                api,
                "call_tencent_ai3d",
                return_value={"Status": "DONE"},
            ) as query:
                task = api.query_hunyuan_task("job-1")

        self.assertEqual(task_id, "job-1")
        self.assertEqual(submit.call_args.args[0], "SubmitHunyuanTo3DJob")
        self.assertEqual(
            submit.call_args.args[1],
            {
                "Prompt": "Generate a ceramic mug",
                "ResultFormat": "GLB",
                "EnablePBR": True,
            },
        )
        self.assertEqual(task, {"Status": "DONE"})
        self.assertEqual(query.call_args.args[0], "QueryHunyuanTo3DJob")
        self.assertEqual(query.call_args.args[1], {"JobId": "job-1"})


class ImageProviderTests(unittest.TestCase):
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
