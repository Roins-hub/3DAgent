import importlib
import os
import unittest
from unittest.mock import Mock, patch


def test_env(extra_env=None):
    env = {
        "CADAM_LLM_PROVIDER": "mimo",
        "CADAM_CHAT_MODEL": "mimo-v2.5-pro",
        "CADAM_DEEPSEEK_BASE_URL": "https://deepseek.example",
        "CADAM_DEEPSEEK_MODELS": "deepseek-v4-flash,deepseek-v4-pro",
        "CADAM_DEEPSEEK_MAX_TOKENS": "8000",
        "CADAM_DEEPSEEK_TIMEOUT_SECONDS": "45",
        "CADAM_DEEPSEEK_API_KEY": "test-deepseek-key",
        "MIMO_API_KEY": "test-mimo-key",
        "MIMO_BASE_URL": "https://mimo.example/v1",
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


class CadamGenerationTests(unittest.TestCase):
    def test_mimo_cadam_uses_larger_completion_budget(self):
        with test_env():
            api = load_api()
            request = api.CadamGenerateRequest(
                prompt="生成一个 M6 螺母",
                parameters={"width": 48, "height": 36, "depth": 20},
            )
            payload = {
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"name":"hex_nut","description":"M6 螺母",'
                                '"parameters":{"width":10,"height":5.2,"depth":5.2,'
                                '"thickness":5.2,"holeDiameter":6},'
                                '"scad":"module hex_nut(width=10, height=5.2, '
                                'depth=5.2, holeDiameter=6) { difference() { '
                                'cylinder(d=width, h=height, $fn=6); '
                                'translate([0,0,-1]) cylinder(d=holeDiameter, '
                                'h=height+2, $fn=48); } } hex_nut();"}'
                            )
                        }
                    }
                ]
            }

            with patch.object(api.requests, "post", return_value=response_mock(payload)) as post:
                result = api.call_mimo_cadam_generation(request)

        self.assertEqual(result.name, "hex_nut")
        self.assertEqual(post.call_args.kwargs["json"]["max_completion_tokens"], 6000)

    def test_mimo_cadam_completion_budget_can_be_overridden(self):
        with test_env():
            api = load_api()

        with patch.object(api, "runtime_setting_value", return_value="8000"):
            self.assertEqual(api.cadam_mimo_max_completion_tokens(), 8000)

    def test_cadam_cascade_tries_deepseek_flash_pro_mimo_then_openai(self):
        with test_env({"CADAM_LLM_PROVIDER": "cascade", "OPENAI_API_KEY": "test-openai-key"}):
            api = load_api()
            request = api.CadamGenerateRequest(prompt="make a bracket")

            async def run_endpoint():
                return await api.cadam_generate(request)

            deepseek_models: list[str] = []

            def fail_deepseek(_request, model):
                deepseek_models.append(model)
                raise api.HTTPException(status_code=502)

            with (
                patch.object(api, "call_deepseek_cadam_generation", side_effect=fail_deepseek),
                patch.object(api, "call_mimo_cadam_generation", side_effect=api.HTTPException(status_code=502)),
                patch.object(
                    api,
                    "call_openai_cadam_generation",
                    return_value=api.CadamGenerateResponse(
                        name="fallback_bracket",
                        description="fallback",
                        parameters={},
                        scad="module fallback_bracket(){cube([1,1,1]);} fallback_bracket();",
                        provider="openai-compatible",
                        model="gpt-4o-mini",
                    ),
                ) as openai_generate,
            ):
                import asyncio

                result = asyncio.run(run_endpoint())

        self.assertEqual(deepseek_models, ["deepseek-v4-flash", "deepseek-v4-pro"])
        self.assertEqual(result.provider, "openai-compatible")
        openai_generate.assert_called_once()

    def test_deepseek_cadam_uses_larger_completion_budget_and_final_content_prompt(self):
        with test_env():
            api = load_api()
            request = api.CadamGenerateRequest(prompt="make a bracket")
            payload = {
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"name":"bracket","description":"bracket",'
                                '"parameters":{"width":80,"height":50,"depth":40,"thickness":5,"holeDiameter":6},'
                                '"scad":"module bracket(){cube([80,40,5]);} bracket();"}'
                            )
                        }
                    }
                ]
            }

            with patch.object(api.requests, "post", return_value=response_mock(payload)) as post:
                result = api.call_deepseek_cadam_generation(request, "deepseek-v4-flash")

        sent_payload = post.call_args.kwargs["json"]
        self.assertEqual(result.provider, "deepseek")
        self.assertEqual(sent_payload["max_tokens"], 8000)
        self.assertEqual(post.call_args.kwargs["timeout"], 45)
        self.assertIn("message.content", sent_payload["messages"][0]["content"])

    def test_openai_cadam_uses_configured_token_budget_and_timeout(self):
        with test_env(
            {
                "CADAM_LLM_PROVIDER": "openai",
                "CADAM_OPENAI_MODEL": "gpt-5",
                "CADAM_OPENAI_MAX_TOKENS": "8000",
                "CADAM_OPENAI_TIMEOUT_SECONDS": "180",
                "OPENAI_API_KEY": "test-openai-key",
            }
        ):
            api = load_api()
            request = api.CadamGenerateRequest(prompt="make a bracket")
            payload = {
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"name":"bracket","description":"bracket",'
                                '"parameters":{"width":80,"height":50,"depth":40,"thickness":5,"holeDiameter":6},'
                                '"scad":"module bracket(){cube([80,40,5]);} bracket();"}'
                            )
                        }
                    }
                ]
            }

            with patch.object(api.requests, "post", return_value=response_mock(payload)) as post:
                result = api.call_openai_cadam_generation(request)

        sent_payload = post.call_args.kwargs["json"]
        self.assertEqual(result.model, "gpt-5")
        self.assertEqual(sent_payload["max_tokens"], 8000)
        self.assertEqual(post.call_args.kwargs["timeout"], 180)

    def test_cadam_endpoint_uses_local_cad_not_openai_when_mimo_fails(self):
        with test_env({"OPENAI_API_KEY": "test-openai-key"}):
            api = load_api()
            request = api.CadamGenerateRequest(prompt="????????")

            async def run_endpoint():
                return await api.cadam_generate(request)

            with (
                patch.object(api, "cadam_llm_provider", return_value="mimo"),
                patch.object(api, "call_mimo_cadam_generation", side_effect=api.HTTPException(status_code=502)),
                patch.object(api, "call_openai_cadam_generation") as openai_generate,
            ):
                import asyncio

                result = asyncio.run(run_endpoint())

        self.assertEqual(result.provider, "local-cadam")
        openai_generate.assert_not_called()

    def test_cadam_mimo_failure_returns_local_cad_for_general_prompt(self):
        with test_env():
            api = load_api()
            request = api.CadamGenerateRequest(
                prompt="make a motor bracket with four mounting holes",
                parameters={"width": 96, "height": 64, "depth": 38, "thickness": 6, "holeDiameter": 8},
            )

            async def run_endpoint():
                return await api.cadam_generate(request)

            with patch.object(api, "call_mimo_cadam_generation", side_effect=api.HTTPException(status_code=502)):
                import asyncio

                result = asyncio.run(run_endpoint())

        self.assertEqual(result.provider, "local-cadam")
        self.assertIn("module", result.scad)
        self.assertIn("cube", result.scad)
        self.assertEqual(result.parameters["width"], 96)

    def test_cadam_generate_persists_authenticated_result_to_history(self):
        with test_env():
            api = load_api()
            request = api.CadamGenerateRequest(
                prompt="make a motor bracket",
                parameters={"width": 96, "height": 64, "depth": 38},
            )
            generated = api.CadamGenerateResponse(
                name="motor_bracket",
                description="bracket",
                parameters={"width": 96, "height": 64, "depth": 38},
                scad="module motor_bracket(){cube([96,38,6]);} motor_bracket();",
                provider="openai-compatible",
                model="gpt-4o-mini",
            )

            async def run_endpoint():
                return await api.cadam_generate(request, "Bearer token")

            with (
                patch.object(api, "verify_supabase_user", return_value=api.AuthUser(id="user-1", email="u@example.com")),
                patch.object(api, "call_mimo_cadam_generation", return_value=generated),
                patch.object(api, "insert_history_row") as insert_history,
            ):
                import asyncio

                result = asyncio.run(run_endpoint())

        self.assertEqual(result.name, "motor_bracket")
        insert_history.assert_called_once()
        row, authorization = insert_history.call_args.args
        self.assertEqual(authorization, "Bearer token")
        self.assertEqual(row["user_id"], "user-1")
        self.assertEqual(row["kind"], "cadam")
        self.assertEqual(row["status"], "completed")
        self.assertEqual(row["progress"], 100)
        self.assertEqual(row["target_format"], "scad")
        self.assertEqual(row["metadata"]["provider"], "openai-compatible")
        self.assertEqual(row["metadata"]["model"], "gpt-4o-mini")
        self.assertEqual(row["metadata"]["scad"], generated.scad)

    def test_cadam_fastener_prompt_overrides_wrong_llm_shape(self):
        with test_env({"CADAM_LLM_PROVIDER": "openai", "OPENAI_API_KEY": "test-openai-key"}):
            api = load_api()
            request = api.CadamGenerateRequest(
                prompt="M6x20 内六角圆柱头螺钉",
                parameters={"width": 96, "height": 64, "depth": 38},
            )

            async def run_endpoint():
                return await api.cadam_generate(request)

            with patch.object(
                api,
                "call_openai_cadam_generation",
                return_value=api.CadamGenerateResponse(
                    name="motor_bracket",
                    description="支架",
                    parameters={"width": 96, "height": 64, "depth": 38},
                    scad="module motor_bracket(){cube([96,38,6]);} motor_bracket();",
                    provider="openai-compatible",
                    model="gpt-4o-mini",
                ),
            ):
                import asyncio

                result = asyncio.run(run_endpoint())

        self.assertEqual(result.provider, "local-cadam")
        self.assertIn("socket_head_screw", result.name)
        self.assertIn("cylinder", result.scad)
        self.assertEqual(result.parameters["kind"], "screw")

    def test_cadam_fastener_length_uses_length_label(self):
        with test_env({"CADAM_LLM_PROVIDER": "openai", "OPENAI_API_KEY": "test-openai-key"}):
            api = load_api()
            response = api.local_socket_head_screw_response(
                api.CadamGenerateRequest(prompt="M4 机器螺丝，长度 12mm")
            )

        self.assertEqual(response.parameters["thickness"], 4)
        self.assertEqual(response.parameters["width"], 12)


if __name__ == "__main__":
    unittest.main()
