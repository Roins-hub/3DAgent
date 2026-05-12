import importlib
import asyncio
import os
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

import requests


def test_env(extra_env=None):
    env = {
        "MODEL_PROVIDER": "mock",
        "IMAGE_PROVIDER": "mock",
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_PUBLISHABLE_KEY": "test-publishable-key",
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


class HistoryPersistenceTests(unittest.TestCase):
    def test_auth_verification_uses_short_lived_cache(self):
        with test_env():
            api = load_api()

            with patch.object(
                api.requests,
                "get",
                return_value=response_mock(
                    {
                        "id": "user-1",
                        "email": "user@example.com",
                        "user_metadata": {"username": "tester"},
                    }
                ),
            ) as get:
                first = api.verify_supabase_user("Bearer test-token")
                second = api.verify_supabase_user("Bearer test-token")

        self.assertEqual(first, second)
        self.assertEqual(get.call_count, 1)

    def test_auth_verification_retries_transient_network_failure(self):
        with test_env():
            api = load_api()

            with patch.object(
                api.requests,
                "get",
                side_effect=[
                    requests.exceptions.SSLError("EOF occurred in violation of protocol"),
                    response_mock(
                        {
                            "id": "user-1",
                            "email": "user@example.com",
                            "user_metadata": {"username": "tester"},
                        }
                    ),
                ],
            ) as get:
                user = api.verify_supabase_user("Bearer test-token")

        self.assertEqual(user.id, "user-1")
        self.assertEqual(user.email, "user@example.com")
        self.assertEqual(user.username, "tester")
        self.assertEqual(get.call_count, 2)

    def test_get_job_returns_in_memory_job_without_history_roundtrip(self):
        with test_env():
            api = load_api()
            job = api.GenerationJob(
                id="55555555-5555-5555-5555-555555555555",
                prompt="Generate an industrial screw",
                mode="text-to-3d",
                status="running",
                progress=45,
                quality="balanced",
                style="game-ready",
                targetFormat="glb",
                createdAt="2026-04-28T00:00:00+00:00",
                updatedAt="2026-04-28T00:00:30+00:00",
                modelUrl=None,
                thumbnailUrl=None,
                error=None,
            )
            api.jobs[job.id] = job
            api.job_contexts[job.id] = {
                "user_id": "user-1",
                "authorization": "Bearer test-token",
            }

            with (
                patch.object(api, "verify_supabase_user", return_value=api.AuthUser(id="user-1")),
                patch.object(api, "get_history_row", side_effect=AssertionError("history should not be queried")),
            ):
                result = asyncio.run(api.get_job(job.id, "Bearer test-token"))

        self.assertEqual(result, job)

    def test_model_download_uses_disk_cache_after_first_remote_fetch(self):
        with test_env():
            api = load_api()
            row = {
                "id": "66666666-6666-6666-6666-666666666666",
                "user_id": "user-1",
                "kind": "3d",
                "prompt": "Generate an industrial screw",
                "mode": "text-to-3d",
                "status": "completed",
                "progress": 100,
                "quality": "balanced",
                "style": "game-ready",
                "target_format": "glb",
                "result_url": "https://assets.example/model.glb",
                "thumbnail_url": None,
                "error": None,
                "metadata": None,
                "created_at": "2026-04-28T00:00:00+00:00",
                "updated_at": "2026-04-28T00:01:00+00:00",
            }
            response = response_mock({}, 200)
            response.headers = {"content-type": "model/gltf-binary"}
            response.iter_content.return_value = [b"glb-bytes"]

            with tempfile.TemporaryDirectory() as temp_dir:
                api.MODEL_CACHE_DIR = api.Path(temp_dir)
                with (
                    patch.object(api, "verify_supabase_user", return_value=api.AuthUser(id="user-1")),
                    patch.object(api, "get_history_row", return_value=row),
                    patch.object(api.requests, "get", return_value=response) as get,
                ):
                    first = asyncio.run(api.get_job_model(row["id"], "glb", "Bearer test-token"))
                    second = asyncio.run(api.get_job_model(row["id"], "glb", "Bearer test-token"))

        self.assertEqual(get.call_count, 1)
        self.assertEqual(first.path, second.path)

    def test_model_download_converts_glb_to_requested_format_when_provider_url_missing(self):
        with test_env():
            api = load_api()
            row = {
                "id": "88888888-8888-8888-8888-888888888888",
                "user_id": "user-1",
                "kind": "3d",
                "prompt": "Generate a bee",
                "mode": "text-to-3d",
                "status": "completed",
                "progress": 100,
                "quality": "balanced",
                "style": "game-ready",
                "target_format": "glb",
                "result_url": "https://assets.example/bee.glb",
                "thumbnail_url": None,
                "error": None,
                "metadata": None,
                "created_at": "2026-04-28T00:00:00+00:00",
                "updated_at": "2026-04-28T00:01:00+00:00",
            }
            response = response_mock({}, 200)
            response.iter_content.return_value = [b"glb-bytes"]

            with tempfile.TemporaryDirectory() as temp_dir:
                api.MODEL_CACHE_DIR = api.Path(temp_dir)
                with (
                    patch.object(api, "verify_supabase_user", return_value=api.AuthUser(id="user-1")),
                    patch.object(api, "get_history_row", return_value=row),
                    patch.object(api.requests, "get", return_value=response) as get,
                    patch.object(api, "convert_model_file") as convert,
                ):
                    result = asyncio.run(api.get_job_model(row["id"], "obj", "Bearer test-token"))

        self.assertEqual(get.call_count, 1)
        convert.assert_called_once()
        self.assertTrue(str(result.path).endswith(".obj"))

    def test_estimated_model_progress_advances_without_reaching_completion(self):
        with test_env():
            api = load_api()

            self.assertEqual(api.estimated_model_progress(0, 180), 5)
            self.assertGreater(api.estimated_model_progress(60, 180), 5)
            self.assertLessEqual(api.estimated_model_progress(360, 180), 96)

    def test_image_download_uses_disk_cache_after_first_remote_fetch(self):
        with test_env():
            api = load_api()
            row = {
                "id": "77777777-7777-7777-7777-777777777777",
                "user_id": "user-1",
                "kind": "image",
                "prompt": "Generate a product render",
                "mode": None,
                "status": "completed",
                "progress": 100,
                "quality": None,
                "style": None,
                "target_format": None,
                "aspect_ratio": "1:1",
                "result_url": "https://assets.example/image.png",
                "thumbnail_url": None,
                "error": None,
                "metadata": None,
                "created_at": "2026-04-28T00:00:00+00:00",
                "updated_at": "2026-04-28T00:01:00+00:00",
            }
            response = response_mock({}, 200)
            response.headers = {"content-type": "image/png"}
            response.iter_content.return_value = [b"png-bytes"]

            with tempfile.TemporaryDirectory() as temp_dir:
                api.IMAGE_CACHE_DIR = api.Path(temp_dir)
                with (
                    patch.object(api, "verify_supabase_user", return_value=api.AuthUser(id="user-1")),
                    patch.object(api, "get_history_row", return_value=row),
                    patch.object(api.requests, "get", return_value=response) as get,
                ):
                    first = asyncio.run(api.get_image_job_image(row["id"], "Bearer test-token"))
                    second = asyncio.run(api.get_image_job_image(row["id"], "Bearer test-token"))

        self.assertEqual(get.call_count, 1)
        self.assertEqual(first.path, second.path)

    def test_local_image_missing_returns_gone_instead_of_404(self):
        with test_env():
            api = load_api()
            row = {
                "id": "99999999-9999-9999-9999-999999999999",
                "user_id": "user-1",
                "kind": "image",
                "prompt": "Generate a product render",
                "mode": None,
                "status": "completed",
                "progress": 100,
                "quality": None,
                "style": None,
                "target_format": None,
                "aspect_ratio": "1:1",
                "result_url": "local://image-jobs/99999999-9999-9999-9999-999999999999/image",
                "thumbnail_url": None,
                "error": None,
                "metadata": None,
                "created_at": "2026-04-28T00:00:00+00:00",
                "updated_at": "2026-04-28T00:01:00+00:00",
            }

            with tempfile.TemporaryDirectory() as temp_dir:
                api.IMAGE_CACHE_DIR = api.Path(temp_dir) / "generated"
                api.LEGACY_IMAGE_CACHE_DIR = api.Path(temp_dir) / "legacy"
                with (
                    patch.object(api, "verify_supabase_user", return_value=api.AuthUser(id="user-1")),
                    patch.object(api, "get_history_row", return_value=row),
                ):
                    with self.assertRaises(api.HTTPException) as raised:
                        asyncio.run(api.get_image_job_image(row["id"], "Bearer test-token"))

        self.assertEqual(raised.exception.status_code, 410)

    def test_storage_image_download_uses_disk_cache(self):
        with test_env():
            api = load_api()
            job = api.ImageJob(
                id="12121212-1212-1212-1212-121212121212",
                prompt="Generate a preview",
                status="completed",
                progress=100,
                aspectRatio="1:1",
                createdAt="2026-04-28T00:00:00+00:00",
                updatedAt="2026-04-28T00:00:00+00:00",
                imageUrl=api.storage_image_url("12121212-1212-1212-1212-121212121212"),
                error=None,
            )
            response = response_mock({}, 200)
            response.iter_content.return_value = [b"png-bytes"]

            with tempfile.TemporaryDirectory() as temp_dir:
                api.IMAGE_CACHE_DIR = api.Path(temp_dir) / "generated"
                api.LEGACY_IMAGE_CACHE_DIR = api.Path(temp_dir) / "legacy"
                with patch.object(api.requests, "get", return_value=response) as get:
                    first = api.download_storage_image(job)
                    second = api.download_storage_image(job)

        self.assertEqual(get.call_count, 1)
        self.assertEqual(first, second)

    def test_mock_image_generation_writes_local_file(self):
        with test_env():
            api = load_api()
            job = api.ImageJob(
                id="10101010-1010-1010-1010-101010101010",
                prompt="Generate a preview",
                status="queued",
                progress=0,
                aspectRatio="1:1",
                createdAt="2026-04-28T00:00:00+00:00",
                updatedAt="2026-04-28T00:00:00+00:00",
                imageUrl=None,
                error=None,
            )

            with tempfile.TemporaryDirectory() as temp_dir:
                api.IMAGE_CACHE_DIR = api.Path(temp_dir) / "generated"
                api.image_jobs[job.id] = job
                with (
                    patch.object(api, "persist_image_job_update"),
                    patch.object(api, "upload_generated_image", return_value=api.storage_image_url(job.id)),
                ):
                    asyncio.run(api.simulate_image_generation(job.id))

                image_path = api.image_cache_path(job.id)
                updated = api.image_jobs[job.id]
                image_exists = image_path.exists()

        self.assertTrue(image_exists)
        self.assertEqual(updated.status, "completed")
        self.assertEqual(updated.imageUrl, f"supabase-storage://generation-assets/image-jobs/{job.id}.png")

    def test_estimated_image_progress_advances_without_reaching_completion(self):
        with test_env():
            api = load_api()

            self.assertEqual(api.estimated_image_progress(0, 120), 35)
            self.assertGreater(api.estimated_image_progress(30, 120), 35)
            self.assertLessEqual(api.estimated_image_progress(240, 120), 96)

    def test_generation_job_round_trips_through_history_row(self):
        with test_env():
            api = load_api()
            job = api.GenerationJob(
                id="11111111-1111-1111-1111-111111111111",
                prompt="生成一个玻璃台灯",
                mode="text-to-3d",
                status="completed",
                progress=100,
                quality="balanced",
                style="game-ready",
                targetFormat="glb",
                createdAt="2026-04-28T00:00:00+00:00",
                updatedAt="2026-04-28T00:01:00+00:00",
                modelUrl="https://assets.example/model.glb",
                thumbnailUrl="https://assets.example/thumb.png",
                error=None,
                metadata=api.JobMetadata(
                    engine="Mock",
                    polygonBudget="18k",
                    textureSet="PBR",
                    providerTaskId="provider-1",
                ),
            )

            row = api.generation_job_to_history_row(job, "user-1")
            restored = api.history_row_to_generation_job(row)

        self.assertEqual(row["user_id"], "user-1")
        self.assertEqual(row["kind"], "3d")
        self.assertEqual(row["result_url"], "https://assets.example/model.glb")
        self.assertEqual(restored, job)

    def test_image_job_round_trips_through_history_row(self):
        with test_env():
            api = load_api()
            job = api.ImageJob(
                id="22222222-2222-2222-2222-222222222222",
                prompt="生成一张城市雨夜图片",
                status="completed",
                progress=100,
                aspectRatio="16:9",
                createdAt="2026-04-28T00:00:00+00:00",
                updatedAt="2026-04-28T00:01:00+00:00",
                imageUrl="https://assets.example/image.png",
                error=None,
            )

            row = api.image_job_to_history_row(job, "user-1")
            restored = api.history_row_to_image_job(row)

        self.assertEqual(row["user_id"], "user-1")
        self.assertEqual(row["kind"], "image")
        self.assertEqual(row["result_url"], "https://assets.example/image.png")
        self.assertEqual(restored, job)

    def test_generation_update_survives_history_patch_network_failure(self):
        with test_env():
            api = load_api()
            job = api.GenerationJob(
                id="33333333-3333-3333-3333-333333333333",
                prompt="Generate an industrial screw",
                mode="text-to-3d",
                status="queued",
                progress=0,
                quality="balanced",
                style="game-ready",
                targetFormat="glb",
                createdAt="2026-04-28T00:00:00+00:00",
                updatedAt="2026-04-28T00:00:00+00:00",
                modelUrl=None,
                thumbnailUrl=None,
                error=None,
            )
            api.jobs[job.id] = job
            api.job_contexts[job.id] = {
                "user_id": "user-1",
                "authorization": "Bearer test-token",
            }

            with patch.object(
                api,
                "patch_history_row",
                side_effect=requests.exceptions.SSLError("EOF occurred in violation of protocol"),
            ):
                updated = api.update_job(job.id, status="running", progress=42)

        self.assertIsNotNone(updated)
        self.assertEqual(updated.status, "running")
        self.assertEqual(updated.progress, 42)

    def test_image_update_survives_history_patch_network_failure(self):
        with test_env():
            api = load_api()
            job = api.ImageJob(
                id="44444444-4444-4444-4444-444444444444",
                prompt="Generate a preview",
                status="queued",
                progress=0,
                aspectRatio="1:1",
                createdAt="2026-04-28T00:00:00+00:00",
                updatedAt="2026-04-28T00:00:00+00:00",
                imageUrl=None,
                error=None,
            )
            api.image_jobs[job.id] = job
            api.job_contexts[job.id] = {
                "user_id": "user-1",
                "authorization": "Bearer test-token",
            }

            with patch.object(
                api,
                "patch_history_row",
                side_effect=requests.exceptions.SSLError("EOF occurred in violation of protocol"),
            ):
                updated = api.update_image_job(job.id, status="running", progress=35)

        self.assertIsNotNone(updated)
        self.assertEqual(updated.status, "running")
        self.assertEqual(updated.progress, 35)

    def test_image_progress_persistence_does_not_block_job_update(self):
        with test_env():
            api = load_api()
            job = api.ImageJob(
                id="45454545-4545-4545-4545-454545454545",
                prompt="Generate a preview",
                status="queued",
                progress=0,
                aspectRatio="1:1",
                createdAt="2026-04-28T00:00:00+00:00",
                updatedAt="2026-04-28T00:00:00+00:00",
                imageUrl=None,
                error=None,
            )
            api.image_jobs[job.id] = job
            api.job_contexts[job.id] = {
                "user_id": "user-1",
                "authorization": "Bearer test-token",
            }

            def slow_patch(*_args, **_kwargs):
                time.sleep(1)

            with patch.object(api, "patch_history_row", side_effect=slow_patch):
                started = time.perf_counter()
                updated = api.update_image_job(job.id, status="running", progress=35)
                elapsed = time.perf_counter() - started

        self.assertIsNotNone(updated)
        self.assertLess(elapsed, 0.25)

    def test_help_reply_explains_cad_parameter_to_modeling_flow(self):
        with test_env():
            api = load_api()
            request = api.HelpChatRequest(
                messages=[
                    api.HelpChatMessage(
                        role="user",
                        content="我想先让AI给出CAD参数值，然后用CAD建模，怎么做？",
                    )
                ]
            )

            reply = api.build_help_reply(request)

        self.assertIn("CAD参数", reply)
        self.assertIn("CADAM", reply)
        self.assertIn("建模", reply)


if __name__ == "__main__":
    unittest.main()
