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
                        ]
                    )
                raise AssertionError(path)

            with (
                patch.object(api, "verify_admin_user", return_value=api.AuthUser(id="admin-1", email="admin@example.com")),
                patch.object(api, "supabase_admin_request", side_effect=fake_admin_request),
            ):
                summary = asyncio.run(api.admin_summary("Bearer token"))

        self.assertEqual(summary.totalUsers, 2)
        self.assertEqual(summary.totalJobs, 3)
        self.assertEqual(summary.failedJobs, 1)
        self.assertEqual(summary.imageJobs, 1)
        self.assertEqual(summary.modelJobs, 2)

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


if __name__ == "__main__":
    unittest.main()
