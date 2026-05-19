import asyncio
import importlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


def test_env(extra_env=None):
    env = {
        "MODEL_PROVIDER": "mock",
        "IMAGE_PROVIDER": "mock",
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_PUBLISHABLE_KEY": "test-publishable-key",
        "SUPABASE_SERVICE_ROLE_KEY": "test-service-role-key",
        "ADMIN_EMAIL_ALLOWLIST": "admin@example.com",
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


def auth_user(email="admin@example.com"):
    return {
        "id": "admin-1",
        "email": email,
        "user_metadata": {"username": "admin"},
    }


class AdminApiTests(unittest.TestCase):
    def test_health_does_not_require_runtime_settings(self):
        with test_env(
            {
                "MODEL_PROVIDER": "hunyuan",
                "IMAGE_PROVIDER": "openai",
                "CADAM_LLM_PROVIDER": "openai",
            }
        ):
            api = load_api()

            with patch.object(api, "runtime_settings_map", side_effect=RuntimeError("network unavailable")):
                result = asyncio.run(api.health())

        self.assertEqual(result["provider"], "hunyuan")
        self.assertEqual(result["imageProvider"], "openai")
        self.assertEqual(result["cadamProvider"], "openai")

    def test_admin_allowed_origins_are_loaded_from_env(self):
        with test_env({"ADMIN_ALLOWED_ORIGINS": "https://admin.hhlai.xyz, https://ops.hhlai.xyz"}):
            api = load_api()

        cors_middleware = next(
            middleware
            for middleware in api.app.user_middleware
            if middleware.cls.__name__ == "CORSMiddleware"
        )

        self.assertEqual(
            cors_middleware.kwargs["allow_origins"],
            ["https://admin.hhlai.xyz", "https://ops.hhlai.xyz"],
        )

    def test_admin_user_requires_allowlisted_email(self):
        with test_env():
            api = load_api()
            with patch.object(api, "verify_supabase_user", return_value=api.AuthUser(id="u1", email="user@example.com")):
                with self.assertRaises(api.HTTPException) as exc:
                    api.verify_admin_user("Bearer token")

        self.assertEqual(exc.exception.status_code, 403)

    def test_admin_summary_counts_users_and_jobs(self):
        with test_env():
            api = load_api()

            def fake_admin_request(method, path, **kwargs):
                if path.startswith("/auth/v1/admin/users"):
                    return response_mock({"users": [auth_user(), auth_user("user@example.com")]})
                if path.startswith("generation_jobs"):
                    return response_mock(
                        [
                            {"kind": "3d", "status": "completed", "created_at": "2026-05-06T01:00:00+00:00"},
                            {"kind": "image", "status": "failed", "created_at": "2026-05-06T02:00:00+00:00"},
                            {"kind": "3d", "status": "running", "created_at": "2026-05-05T01:00:00+00:00"},
                            {"kind": "paramcad", "status": "completed", "created_at": "2026-05-05T02:00:00+00:00"},
                        ]
                    )
                raise AssertionError(path)

            with (
                patch.object(api, "verify_admin_user", return_value=api.AuthUser(id="admin-1", email="admin@example.com")),
                patch.object(api, "supabase_admin_request", side_effect=fake_admin_request),
            ):
                summary = asyncio.run(api.admin_summary("Bearer token"))

        self.assertEqual(summary.totalUsers, 2)
        self.assertEqual(summary.totalJobs, 4)
        self.assertEqual(summary.failedJobs, 1)
        self.assertEqual(summary.imageJobs, 1)
        self.assertEqual(summary.modelJobs, 2)
        self.assertEqual(summary.paramcadJobs, 1)

    def test_admin_generation_jobs_allows_cadam_filter(self):
        with test_env():
            api = load_api()
            calls = []

            def fake_admin_request(method, path, **kwargs):
                calls.append((method, path, kwargs))
                return response_mock(
                    [
                        {
                            "id": "cadam-1",
                            "user_id": "user-1",
                            "kind": "cadam",
                            "prompt": "make a bracket",
                            "status": "completed",
                            "progress": 100,
                            "created_at": "2026-05-08T01:00:00+00:00",
                            "updated_at": "2026-05-08T01:00:00+00:00",
                        }
                    ]
                )

            with (
                patch.object(api, "verify_admin_user", return_value=api.AuthUser(id="admin-1", email="admin@example.com")),
                patch.object(api, "supabase_admin_request", side_effect=fake_admin_request),
            ):
                result = asyncio.run(api.admin_list_generation_jobs(kind="cadam", authorization="Bearer token"))

        self.assertEqual(result["jobs"][0]["kind"], "cadam")
        self.assertIn("kind=eq.cadam", calls[0][1])

    def test_admin_generation_jobs_allows_paramcad_filter(self):
        with test_env():
            api = load_api()
            calls = []

            def fake_admin_request(method, path, **kwargs):
                calls.append((method, path, kwargs))
                return response_mock(
                    [
                        {
                            "id": "paramcad-1",
                            "user_id": "user-1",
                            "kind": "paramcad",
                            "prompt": "design a spindle shaft",
                            "status": "completed",
                            "progress": 100,
                            "target_format": "step",
                            "created_at": "2026-05-08T01:00:00+00:00",
                            "updated_at": "2026-05-08T01:00:00+00:00",
                        }
                    ]
                )

            with (
                patch.object(api, "verify_admin_user", return_value=api.AuthUser(id="admin-1", email="admin@example.com")),
                patch.object(api, "supabase_admin_request", side_effect=fake_admin_request),
            ):
                result = asyncio.run(api.admin_list_generation_jobs(kind="paramcad", authorization="Bearer token"))

        self.assertEqual(result["jobs"][0]["kind"], "paramcad")
        self.assertIn("kind=eq.paramcad", calls[0][1])

    def test_admin_retry_cadam_job_creates_completed_cadam_history_row(self):
        with test_env():
            api = load_api()
            calls = []
            source_row = {
                "id": "cadam-source",
                "user_id": "user-1",
                "kind": "cadam",
                "prompt": "make a bracket",
                "status": "completed",
                "progress": 100,
                "target_format": "scad",
                "metadata": {"parameters": {"width": 96}},
                "created_at": "2026-05-08T01:00:00+00:00",
                "updated_at": "2026-05-08T01:00:00+00:00",
            }
            generated = api.CadamGenerateResponse(
                name="motor_bracket",
                description="bracket",
                parameters={"width": 96},
                scad="module motor_bracket(){cube([96,38,6]);} motor_bracket();",
                provider="local-cadam",
                model="parametric-cad-kernel",
            )

            def fake_admin_request(method, path, **kwargs):
                calls.append((method, path, kwargs))
                if method == "GET" and path.startswith("generation_jobs?id=eq."):
                    return response_mock([source_row])
                return response_mock([])

            with (
                patch.object(api, "verify_admin_user", return_value=api.AuthUser(id="admin-1", email="admin@example.com")),
                patch.object(api, "supabase_admin_request", side_effect=fake_admin_request),
                patch.object(api, "supabase_service_role_key", return_value="service-role"),
                patch.object(api, "generate_cadam_response", return_value=generated),
            ):
                result = asyncio.run(
                    api.admin_update_generation_job(
                        "cadam-source",
                        api.AdminGenerationJobAction(action="retry"),
                        "Bearer token",
                    )
                )

        inserted = next(call[2]["json_body"] for call in calls if call[0] == "POST" and call[1] == "generation_jobs")
        self.assertEqual(result["job"]["kind"], "cadam")
        self.assertEqual(inserted["kind"], "cadam")
        self.assertEqual(inserted["status"], "completed")
        self.assertEqual(inserted["progress"], 100)
        self.assertEqual(inserted["metadata"]["retried_from"], "cadam-source")
        self.assertEqual(inserted["metadata"]["scad"], generated.scad)

    def test_admin_retry_paramcad_job_creates_completed_paramcad_history_row(self):
        with test_env():
            api = load_api()
            calls = []
            source_row = {
                "id": "paramcad-source",
                "user_id": "user-1",
                "kind": "paramcad",
                "prompt": "design a spindle shaft",
                "status": "completed",
                "progress": 100,
                "target_format": "step",
                "metadata": {"runFea": True},
                "created_at": "2026-05-08T01:00:00+00:00",
                "updated_at": "2026-05-08T01:00:00+00:00",
            }
            generated = api.ParamcadRunResponse(
                success=True,
                title="spindle shaft",
                material="42CrMo",
                geometryType="stepped_shaft",
                score=93.5,
                iterations=12,
                safetyFactor=2.1,
                maxStress=180.0,
                feaPassed=True,
                stepFile="spindle.step",
                stepDownloadUrl="/api/paramcad/outputs/spindle.step",
                parameters={"length": 240.0},
            )

            def fake_admin_request(method, path, **kwargs):
                calls.append((method, path, kwargs))
                if method == "GET" and path.startswith("generation_jobs?id=eq."):
                    return response_mock([source_row])
                return response_mock([])

            with (
                patch.object(api, "verify_admin_user", return_value=api.AuthUser(id="admin-1", email="admin@example.com")),
                patch.object(api, "supabase_admin_request", side_effect=fake_admin_request),
                patch.object(api, "supabase_service_role_key", return_value="service-role"),
                patch.object(api, "run_paramcad_engine", return_value=generated),
            ):
                result = asyncio.run(
                    api.admin_update_generation_job(
                        "paramcad-source",
                        api.AdminGenerationJobAction(action="retry"),
                        "Bearer token",
                    )
                )

        inserted = next(call[2]["json_body"] for call in calls if call[0] == "POST" and call[1] == "generation_jobs")
        self.assertEqual(result["job"]["kind"], "paramcad")
        self.assertEqual(inserted["kind"], "paramcad")
        self.assertEqual(inserted["status"], "completed")
        self.assertEqual(inserted["target_format"], "step")
        self.assertEqual(inserted["result_url"], "/api/paramcad/outputs/spindle.step")
        self.assertEqual(inserted["metadata"]["retried_from"], "paramcad-source")
        self.assertEqual(inserted["metadata"]["runFea"], True)

    def test_soft_restore_and_hard_delete_generation_job_write_audit_log(self):
        with test_env():
            api = load_api()
            calls = []

            def fake_admin_request(method, path, **kwargs):
                calls.append((method, path, kwargs))
                return response_mock([] if method != "GET" else [{"id": "job-1"}])

            with (
                patch.object(api, "verify_admin_user", return_value=api.AuthUser(id="admin-1", email="admin@example.com")),
                patch.object(api, "supabase_admin_request", side_effect=fake_admin_request),
            ):
                asyncio.run(api.admin_update_generation_job("job-1", api.AdminGenerationJobAction(action="soft_delete"), "Bearer token"))
                asyncio.run(api.admin_update_generation_job("job-1", api.AdminGenerationJobAction(action="restore"), "Bearer token"))
                asyncio.run(api.admin_delete_generation_job("job-1", "Bearer token"))

        methods_and_paths = [(method, path) for method, path, _ in calls]
        self.assertIn(("PATCH", "generation_jobs?id=eq.job-1"), methods_and_paths)
        self.assertIn(("DELETE", "generation_jobs?id=eq.job-1"), methods_and_paths)
        audit_posts = [call for call in calls if call[0] == "POST" and call[1] == "admin_audit_logs"]
        self.assertEqual(len(audit_posts), 3)

    def test_settings_update_returns_secret_values_and_syncs_local_env(self):
        with test_env():
            api = load_api()

            def fake_admin_request(method, path, **kwargs):
                if method == "POST" and path == "admin_settings":
                    return response_mock([])
                if method == "GET" and path.startswith("admin_settings"):
                    return response_mock(
                        [
                            {"key": "MODEL_PROVIDER", "value": "hunyuan", "is_secret": False, "updated_at": "2026-05-06T00:00:00+00:00"},
                            {"key": "OPENAI_API_KEY", "value": "sk-secret", "is_secret": True, "updated_at": "2026-05-06T00:00:00+00:00"},
                        ]
                    )
                if method == "POST" and path == "admin_audit_logs":
                    return response_mock([])
                raise AssertionError(path)

            with tempfile.TemporaryDirectory() as temp_dir:
                api.API_ENV_PATH = Path(temp_dir) / ".env"
                api.API_ENV_PATH.write_text("MODEL_PROVIDER=mock\nOPENAI_API_KEY=old-key\n", encoding="utf-8")
                with (
                    patch.object(api, "verify_admin_user", return_value=api.AuthUser(id="admin-1", email="admin@example.com")),
                    patch.object(api, "supabase_admin_request", side_effect=fake_admin_request),
                ):
                    result = asyncio.run(
                        api.admin_update_settings(
                            api.AdminSettingsUpdate(
                                settings=[
                                    api.AdminSettingInput(key="MODEL_PROVIDER", value="hunyuan", isSecret=False),
                                    api.AdminSettingInput(key="OPENAI_API_KEY", value="sk-secret", isSecret=True),
                                ]
                            ),
                            "Bearer token",
                        )
                    )
                env_text = api.API_ENV_PATH.read_text(encoding="utf-8")

        secret = next(item for item in result.settings if item.key == "OPENAI_API_KEY")
        self.assertTrue(secret.isSecret)
        self.assertEqual(secret.value, "sk-secret")
        self.assertTrue(secret.isConfigured)
        self.assertIn("MODEL_PROVIDER=hunyuan", env_text)
        self.assertIn("OPENAI_API_KEY=sk-secret", env_text)

    def test_cad_script_api_key_is_secret_visible_setting(self):
        with test_env({"CAD_SCRIPT_API_KEY": "sk-cad-script"}):
            api = load_api()

            self.assertIn("CAD_SCRIPT_API_KEY", api.ADMIN_VISIBLE_SETTING_KEYS)
            self.assertIn("CAD_SCRIPT_API_KEY", api.ADMIN_SECRET_KEYS)

            merged = api.merge_settings_with_environment([])
            cad_key = next(item for item in merged if item["key"] == "CAD_SCRIPT_API_KEY")

        self.assertTrue(cad_key["is_secret"])
        self.assertEqual(cad_key["value"], "sk-cad-script")

    def test_legacy_ai_paramcad_settings_are_not_visible(self):
        with test_env({"AI_PARAMCAD_BASE_URL": "http://localhost:8088"}):
            api = load_api()

            self.assertNotIn("AI_PARAMCAD_BASE_URL", api.ADMIN_VISIBLE_SETTING_KEYS)
            self.assertNotIn("AI_PARAMCAD_TIMEOUT_SECONDS", api.ADMIN_VISIBLE_SETTING_KEYS)

            merged = api.merge_settings_with_environment([])
            keys = {item["key"] for item in merged}

        self.assertNotIn("AI_PARAMCAD_BASE_URL", keys)
        self.assertNotIn("AI_PARAMCAD_TIMEOUT_SECONDS", keys)


if __name__ == "__main__":
    unittest.main()
