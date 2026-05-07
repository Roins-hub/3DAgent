import importlib
import os
import unittest
from unittest.mock import Mock, patch


def test_env(extra_env=None):
    env = {
        "CADAM_LLM_PROVIDER": "mimo",
        "CADAM_CHAT_MODEL": "mimo-v2.5-pro",
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

    def test_cadam_endpoint_falls_back_to_openai_when_mimo_fails(self):
        with test_env({"OPENAI_API_KEY": "test-openai-key"}):
            api = load_api()
            request = api.CadamGenerateRequest(prompt="生成一个 M6 螺母")

            async def run_endpoint():
                return await api.cadam_generate(request)

            with (
                patch.object(api, "cadam_llm_provider", return_value="mimo"),
                patch.object(api, "call_mimo_cadam_generation", side_effect=api.HTTPException(status_code=502)),
                patch.object(
                    api,
                    "call_openai_cadam_generation",
                    return_value=api.CadamGenerateResponse(
                        name="hex_nut",
                        description="M6 螺母",
                        parameters={},
                        scad="module hex_nut(){cube([1,1,1]);} hex_nut();",
                        provider="openai-compatible",
                        model="gpt-4o-mini",
                    ),
                ) as openai_generate,
            ):
                import asyncio

                result = asyncio.run(run_endpoint())

        self.assertEqual(result.provider, "openai-compatible")
        openai_generate.assert_called_once()


if __name__ == "__main__":
    unittest.main()
