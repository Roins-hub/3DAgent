import importlib
import os
import unittest
from unittest.mock import DEFAULT, patch


def test_env(extra_env=None):
    env = {
        "MODEL_PROVIDER": "hunyuan",
        "TENCENTCLOUD_SECRET_ID": "secret-id",
        "TENCENTCLOUD_SECRET_KEY": "secret-key",
    }
    if extra_env:
        env.update(extra_env)
    return patch.dict(os.environ, env, clear=False)


def load_api():
    module = importlib.import_module("apps.api.main")
    return importlib.reload(module)


class HunyuanConfigTests(unittest.TestCase):
    def test_hunyuan_tencentcloud_submits_and_queries_with_tc3_signature(self):
        with test_env():
            api = load_api()
            request = api.CreateJobRequest(
                prompt="Generate a ceramic mug",
                mode="text-to-3d",
                quality="balanced",
                style="game-ready",
                targetFormat="glb",
            )

            with (
                patch.object(api.time, "time", return_value=1779500000),
                patch.object(api.requests, "post") as post,
            ):
                post.return_value.status_code = 200
                post.return_value.json.return_value = {
                    "Response": {
                        "JobId": "job-1",
                        "RequestId": "request-1",
                    },
                }
                task_id = api.create_hunyuan_task(request)

                post.return_value.json.return_value = {
                    "Response": {
                        "Status": "DONE",
                        "ErrorCode": "",
                        "ErrorMessage": "",
                        "ResultFile3Ds": [
                            {"Type": "GLB", "Url": "https://example.test/model.glb"}
                        ],
                        "RequestId": "request-2",
                    },
                }
                task = api.query_hunyuan_task("job-1")

        self.assertEqual(task_id, "job-1")
        self.assertEqual(task["Status"], "DONE")
        self.assertEqual(post.call_count, 2)
        submit_call = post.call_args_list[0]
        self.assertEqual(
            submit_call.args[0],
            "https://ai3d.tencentcloudapi.com/",
        )
        submit_headers = submit_call.kwargs["headers"]
        self.assertEqual(submit_headers["Host"], "ai3d.tencentcloudapi.com")
        self.assertEqual(submit_headers["X-TC-Action"], "SubmitHunyuanTo3DProJob")
        self.assertEqual(submit_headers["X-TC-Version"], "2025-05-13")
        self.assertEqual(submit_headers["X-TC-Region"], "ap-guangzhou")
        self.assertEqual(submit_headers["X-TC-Timestamp"], "1779500000")
        self.assertIn("TC3-HMAC-SHA256 Credential=secret-id/", submit_headers["Authorization"])
        self.assertIn("/ai3d/tc3_request", submit_headers["Authorization"])
        self.assertEqual(submit_call.kwargs["timeout"], (30, 180))
        self.assertEqual(
            api.json.loads(submit_call.kwargs["data"].decode("utf-8")),
            {
                "Model": "3.1",
                "Prompt": "Generate a ceramic mug",
                "EnablePBR": True,
            },
        )
        self.assertNotIn("json", submit_call.kwargs)
        query_call = post.call_args_list[1]
        self.assertEqual(
            query_call.args[0],
            "https://ai3d.tencentcloudapi.com/",
        )
        self.assertEqual(query_call.kwargs["headers"]["X-TC-Action"], "QueryHunyuanTo3DProJob")
        self.assertEqual(api.json.loads(query_call.kwargs["data"].decode("utf-8")), {"JobId": "job-1"})

    def test_hunyuan_stl_request_sends_result_format(self):
        with test_env():
            api = load_api()
            request = api.CreateJobRequest(
                prompt="Generate a ceramic mug",
                mode="text-to-3d",
                quality="balanced",
                style="game-ready",
                targetFormat="stl",
            )

            with patch.object(api.requests, "post") as post:
                post.return_value.status_code = 200
                post.return_value.json.return_value = {
                    "Response": {"JobId": "job-1", "RequestId": "request-1"},
                }
                api.create_hunyuan_task(request)

        self.assertEqual(
            api.json.loads(post.call_args.kwargs["data"].decode("utf-8"))["ResultFormat"],
            "STL",
        )

    def test_hunyuan_request_retries_transient_timeout(self):
        with test_env():
            api = load_api()

            with patch.object(api.requests, "post") as post:
                post.side_effect = [
                    api.requests.exceptions.Timeout("write operation timed out"),
                    DEFAULT,
                ]
                post.return_value.status_code = 200
                post.return_value.json.return_value = {
                    "Response": {"JobId": "job-1", "RequestId": "request-1"},
                }

                result = api.call_tencentcloud_hunyuan("SubmitHunyuanTo3DProJob", {"Prompt": "bolt"})

        self.assertEqual(result["JobId"], "job-1")
        self.assertEqual(post.call_count, 2)

    def test_hunyuan_timeout_error_is_user_readable(self):
        with test_env({"TENCENTCLOUD_HUNYUAN_REQUEST_RETRIES": "1"}):
            api = load_api()

            with patch.object(
                api.requests,
                "post",
                side_effect=api.requests.exceptions.Timeout("write operation timed out"),
            ):
                with self.assertRaises(RuntimeError) as exc:
                    api.call_tencentcloud_hunyuan("SubmitHunyuanTo3DProJob", {"Prompt": "bolt"})

        self.assertIn("腾讯云混元生3D接口请求超时", str(exc.exception))
        self.assertIn("TENCENTCLOUD_HUNYUAN_READ_TIMEOUT_SECONDS", str(exc.exception))

    def test_hunyuan_model_url_reads_tokenhub_data(self):
        with test_env():
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
