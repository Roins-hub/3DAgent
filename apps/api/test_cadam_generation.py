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

    def test_cadam_generate_deduplicates_same_client_request_id(self):
        with test_env():
            api = load_api()
            request = api.CadamGenerateRequest(
                prompt="make a motor bracket",
                parameters={"width": 96},
                clientRequestId="cadam-request-1",
            )
            generated = api.CadamGenerateResponse(
                name="motor_bracket",
                description="bracket",
                parameters={"width": 96},
                scad="module motor_bracket(){cube([96,20,8]);} motor_bracket();",
                provider="mimo",
                model="mimo-v2.5-pro",
            )

            async def run_endpoint_twice():
                first = await api.cadam_generate(request, "Bearer token")
                second = await api.cadam_generate(request, "Bearer token")
                return first, second

            with (
                patch.object(api, "verify_supabase_user", return_value=api.AuthUser(id="user-1", email="u@example.com")),
                patch.object(api, "generate_cadam_response", return_value=generated) as generate,
                patch.object(api, "insert_history_row") as insert_history,
            ):
                import asyncio

                first, second = asyncio.run(run_endpoint_twice())

        self.assertEqual(first.name, "motor_bracket")
        self.assertEqual(second.name, "motor_bracket")
        generate.assert_called_once()
        insert_history.assert_called_once()

    def test_paramcad_run_persists_authenticated_result_to_history(self):
        with test_env():
            api = load_api()
            request = api.ParamcadRunRequest(
                requirement="design a spindle shaft",
                runFea=True,
            )
            generated = api.ParamcadRunResponse(
                success=True,
                title="spindle shaft",
                domain="rotating machinery",
                material="42CrMo",
                geometryType="stepped_shaft",
                score=92.0,
                iterations=10,
                safetyFactor=2.4,
                maxStress=165.0,
                feaPassed=True,
                stepFile="spindle.step",
                stepDownloadUrl="/api/paramcad/outputs/spindle.step",
                parameters={"length": 240.0, "diameter": 36.0},
            )

            async def run_endpoint():
                return await api.paramcad_run(request, "Bearer token")

            with (
                patch.object(api, "verify_supabase_user", return_value=api.AuthUser(id="user-1", email="u@example.com")),
                patch.object(api, "run_paramcad_engine", return_value=generated),
                patch.object(
                    api,
                    "upload_paramcad_step_file",
                    return_value="supabase-storage://generation-assets/paramcad-jobs/stored-job.step",
                ) as upload_step,
                patch.object(api, "insert_history_row") as insert_history,
            ):
                import asyncio

                result = asyncio.run(run_endpoint())

        self.assertEqual(result.title, "spindle shaft")
        upload_step.assert_called_once()
        self.assertEqual(upload_step.call_args.args[1], "spindle.step")
        insert_history.assert_called_once()
        row, authorization = insert_history.call_args.args
        self.assertEqual(authorization, "Bearer token")
        self.assertEqual(row["user_id"], "user-1")
        self.assertEqual(row["kind"], "paramcad")
        self.assertEqual(row["status"], "completed")
        self.assertEqual(row["target_format"], "step")
        self.assertEqual(row["result_url"], "supabase-storage://generation-assets/paramcad-jobs/stored-job.step")
        self.assertEqual(row["metadata"]["runFea"], True)
        self.assertEqual(row["metadata"]["provider"], "cad-script-engine")
        self.assertEqual(row["metadata"]["stepDownloadUrl"], "/api/paramcad/outputs/spindle.step")
        self.assertEqual(row["metadata"]["stepStorageUrl"], "supabase-storage://generation-assets/paramcad-jobs/stored-job.step")

    def test_paramcad_run_deduplicates_same_client_request_id(self):
        with test_env():
            api = load_api()
            request = api.ParamcadRunRequest(
                requirement="design a spindle shaft",
                runFea=True,
                clientRequestId="client-request-1",
            )
            generated = api.ParamcadRunResponse(
                success=True,
                title="spindle shaft",
                geometryType="stepped_shaft",
                stepFile="spindle.step",
                stepDownloadUrl="/api/paramcad/outputs/spindle.step",
                parameters={"length": 240.0, "diameter": 36.0},
            )

            async def run_endpoint_twice():
                first = await api.paramcad_run(request, "Bearer token")
                second = await api.paramcad_run(request, "Bearer token")
                return first, second

            with (
                patch.object(api, "verify_supabase_user", return_value=api.AuthUser(id="user-1", email="u@example.com")),
                patch.object(api, "run_paramcad_engine", return_value=generated) as run_engine,
                patch.object(
                    api,
                    "upload_paramcad_step_file",
                    return_value="supabase-storage://generation-assets/paramcad-jobs/stored-job.step",
                ),
                patch.object(api, "insert_history_row") as insert_history,
            ):
                import asyncio

                first, second = asyncio.run(run_endpoint_twice())

        self.assertEqual(first.stepFile, "spindle.step")
        self.assertEqual(second.stepFile, "spindle.step")
        run_engine.assert_called_once()
        insert_history.assert_called_once()

    def test_paramcad_defaults_to_cad_script_engine(self):
        with test_env():
            api = load_api()

        self.assertEqual(api.paramcad_engine(), "cad-script")

    def test_paramcad_default_output_dir_avoids_api_reload_watcher(self):
        with test_env():
            api = load_api()

        output_dir = api.cad_script_output_dir()
        self.assertNotIn(api.API_DIR, output_dir.parents)

    def test_paramcad_can_run_cad_script_engine(self):
        with test_env(
            {
                "PARAMCAD_ENGINE": "cad-script",
                "CAD_SCRIPT_GENERATOR": "llm",
                "CAD_SCRIPT_API_KEY": "test-cad-script-key",
                "CAD_SCRIPT_BASE_URL": "https://deepseek.example",
                "CAD_SCRIPT_MODEL": "deepseek-v4-pro",
            }
        ):
            api = load_api()
            request = api.ParamcadRunRequest(
                requirement="generate an 80mm circular flange with 6 bolt holes",
                runFea=False,
            )
            cli_payload = {
                "success": True,
                "title": "Circular Flange",
                "geometryType": "flange",
                "parameters": {
                    "outerDiameter": 80.0,
                    "thickness": 10.0,
                    "holeCount": 6.0,
                },
                "stepFile": "F:\\3DAgent\\apps\\api\\generated\\cad-script\\circular_flange.step",
            }
            completed = api.subprocess.CompletedProcess(
                args=["python", "-m", "cad_script_engine.cli"],
                returncode=0,
                stdout=api.json.dumps(cli_payload),
                stderr="",
            )

            with patch.object(api.subprocess, "run", return_value=completed) as run:
                result = api.run_paramcad_engine(request)

        self.assertTrue(result.success)
        self.assertEqual(result.provider, "cad-script-engine")
        self.assertEqual(result.model, "build123d")
        self.assertEqual(result.title, "Circular Flange")
        self.assertEqual(result.geometryType, "flange")
        self.assertEqual(result.stepFile, "circular_flange.step")
        self.assertEqual(result.stepDownloadUrl, "/api/paramcad/outputs/circular_flange.step")
        self.assertEqual(result.parameters["outerDiameter"], 80.0)
        sent_args = run.call_args.args[0]
        self.assertIn("-m", sent_args)
        self.assertIn("cad_script_engine.cli", sent_args)
        self.assertIn("--prompt", sent_args)
        sent_env = run.call_args.kwargs["env"]
        self.assertEqual(sent_env["CAD_SCRIPT_GENERATOR"], "llm")
        self.assertEqual(sent_env["CAD_SCRIPT_API_KEY"], "test-cad-script-key")
        self.assertEqual(sent_env["CAD_SCRIPT_BASE_URL"], "https://deepseek.example")
        self.assertEqual(sent_env["CAD_SCRIPT_MODEL"], "deepseek-v4-pro")

    def test_paramcad_preview_converts_step_to_stl_cache(self):
        with test_env():
            api = load_api()
            output_dir = api.cad_script_output_dir()
            step_path = output_dir / "bearing.step"
            stl_path = output_dir / "bearing.stl"
            step_path.parent.mkdir(parents=True, exist_ok=True)
            step_path.write_text("ISO-10303-21;", encoding="utf-8")
            if stl_path.exists():
                stl_path.unlink()

            with patch.object(api, "convert_step_to_stl_preview") as convert:
                response = api.paramcad_preview_file_response("bearing.step", "stl")

        self.assertEqual(response.media_type, "model/stl")
        convert.assert_called_once_with(step_path.resolve(), stl_path)

    def test_paramcad_preview_rejects_path_traversal(self):
        with test_env():
            api = load_api()

        with self.assertRaises(api.HTTPException) as error:
            api.paramcad_preview_file_response("../bearing.step", "stl")

        self.assertEqual(error.exception.status_code, 404)

    def test_paramcad_cad_script_engine_passes_runtime_settings_to_subprocess(self):
        with test_env({"PARAMCAD_ENGINE": "cad-script"}):
            api = load_api()
            request = api.ParamcadRunRequest(requirement="make a custom mounting bracket")
            completed = api.subprocess.CompletedProcess(
                args=["python", "-m", "cad_script_engine.cli"],
                returncode=0,
                stdout=api.json.dumps(
                    {
                        "success": True,
                        "title": "Custom Bracket",
                        "geometryType": "bracket",
                        "parameters": {"length": 80.0},
                        "stepFile": "F:\\3DAgent\\apps\\api\\generated\\cad-script\\custom_bracket.step",
                    }
                ),
                stderr="",
            )

            def runtime_value(key, default=""):
                values = {
                    "PARAMCAD_ENGINE": "cad-script",
                    "CAD_SCRIPT_GENERATOR": "llm",
                    "CAD_SCRIPT_API_KEY": "runtime-key",
                    "CAD_SCRIPT_BASE_URL": "https://runtime.deepseek.example",
                    "CAD_SCRIPT_MODEL": "deepseek-v4-pro",
                    "CAD_SCRIPT_REPAIR": "true",
                }
                return values.get(key, default)

            with (
                patch.object(api, "runtime_setting_value", side_effect=runtime_value),
                patch.object(api.subprocess, "run", return_value=completed) as run,
            ):
                api.run_paramcad_engine(request)

        sent_env = run.call_args.kwargs["env"]
        self.assertEqual(sent_env["CAD_SCRIPT_GENERATOR"], "llm")
        self.assertEqual(sent_env["CAD_SCRIPT_API_KEY"], "runtime-key")
        self.assertEqual(sent_env["CAD_SCRIPT_BASE_URL"], "https://runtime.deepseek.example")
        self.assertEqual(sent_env["CAD_SCRIPT_MODEL"], "deepseek-v4-pro")
        self.assertEqual(sent_env["CAD_SCRIPT_REPAIR"], "true")

    def test_paramcad_cad_script_engine_uses_dedicated_process_timeout(self):
        with test_env({"PARAMCAD_ENGINE": "cad-script", "CAD_SCRIPT_PROCESS_TIMEOUT_SECONDS": "420"}):
            api = load_api()
            request = api.ParamcadRunRequest(requirement="make a detailed industrial support bracket")
            completed = api.subprocess.CompletedProcess(
                args=["python", "-m", "cad_script_engine.cli"],
                returncode=0,
                stdout=api.json.dumps(
                    {
                        "success": True,
                        "title": "Support Bracket",
                        "geometryType": "bracket",
                        "parameters": {"length": 120.0},
                        "stepFile": "F:\\3DAgent\\apps\\api\\generated\\cad-script\\support_bracket.step",
                    }
                ),
                stderr="",
            )

            with patch.object(api.subprocess, "run", return_value=completed) as run:
                api.run_paramcad_engine(request)

        self.assertEqual(run.call_args.kwargs["timeout"], 420)

    def test_paramcad_cad_script_engine_returns_structured_generation_error(self):
        with test_env({"PARAMCAD_ENGINE": "cad-script"}):
            api = load_api()
            request = api.ParamcadRunRequest(requirement="make a detailed industrial support bracket")
            completed = api.subprocess.CompletedProcess(
                args=["python", "-m", "cad_script_engine.cli"],
                returncode=2,
                stdout=api.json.dumps(
                    {
                        "success": False,
                        "title": None,
                        "geometryType": None,
                        "parameters": {},
                        "sourceFile": None,
                        "stepFile": None,
                        "attempts": 0,
                        "error": "LLM response JSON is invalid",
                    }
                ),
                stderr="",
            )

            with patch.object(api.subprocess, "run", return_value=completed):
                with self.assertRaises(api.HTTPException) as caught:
                    api.run_paramcad_engine(request)

        self.assertEqual(caught.exception.status_code, 502)
        self.assertIn("LLM response JSON is invalid", str(caught.exception.detail))
        self.assertNotIn("invalid JSON: Traceback", str(caught.exception.detail))

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
