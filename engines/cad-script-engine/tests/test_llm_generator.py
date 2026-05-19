import json
import unittest
from unittest.mock import Mock, patch

from cad_script_engine.llm_generator import (
    build_repair_prompt,
    generate_repaired_llm_source,
    generate_llm_build123d_source,
    parse_llm_cad_script,
    validate_generated_source,
)


VALID_SOURCE = "from build123d import *\n\n\ndef gen_step():\n    return Box(10, 10, 10)\n"


class LlmGeneratorTest(unittest.TestCase):
    def test_parse_llm_cad_script_extracts_json_object_from_content(self):
        payload = {
            "title": "Motor Mount",
            "geometryType": "bracket",
            "parameters": {"length": 80, "width": 50},
            "source": VALID_SOURCE,
        }

        result = parse_llm_cad_script(f"```json\n{json.dumps(payload)}\n```")

        self.assertEqual(result.title, "Motor Mount")
        self.assertEqual(result.geometry_type, "bracket")
        self.assertEqual(result.parameters["length"], 80.0)
        self.assertIn("def gen_step():", result.source)

    def test_parse_llm_cad_script_extracts_first_balanced_json_object(self):
        payload = {
            "title": "Motor Mount",
            "geometryType": "bracket",
            "parameters": {"length": 80},
            "source": VALID_SOURCE,
        }
        content = f"Here is the JSON:\n{json.dumps(payload)}\nDo not use this extra object: {{bad}}"

        result = parse_llm_cad_script(content)

        self.assertEqual(result.title, "Motor Mount")
        self.assertEqual(result.parameters["length"], 80.0)

    def test_validate_generated_source_rejects_file_and_process_access(self):
        bad_source = "from build123d import *\nfrom pathlib import Path\n\ndef gen_step():\n    Path('x').write_text('bad')\n"

        with self.assertRaisesRegex(ValueError, "disallowed"):
            validate_generated_source(bad_source)

    def test_generate_llm_build123d_source_calls_openai_compatible_endpoint(self):
        payload = {
            "title": "Motor Mount",
            "geometryType": "bracket",
            "parameters": {"length": 80},
            "source": VALID_SOURCE,
        }
        response = Mock()
        response.status_code = 200
        response.text = "ok"
        response.json.return_value = {"choices": [{"message": {"content": json.dumps(payload)}}]}

        with patch.dict(
            "os.environ",
            {
                "CAD_SCRIPT_API_KEY": "test-key",
                "CAD_SCRIPT_BASE_URL": "https://deepseek.example",
                "CAD_SCRIPT_MODEL": "deepseek-v4-pro",
            },
        ):
            with patch("cad_script_engine.llm_generator.requests.post", return_value=response) as post:
                result = generate_llm_build123d_source("make a motor bracket")

        self.assertEqual(result.title, "Motor Mount")
        self.assertEqual(result.model, "deepseek-v4-pro")
        sent = post.call_args.kwargs["json"]
        self.assertEqual(sent["model"], "deepseek-v4-pro")
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer test-key")
        self.assertEqual(sent["response_format"], {"type": "json_object"})

    def test_generate_llm_build123d_source_uses_configured_token_budget_and_timeout(self):
        payload = {
            "title": "Motor Mount",
            "geometryType": "bracket",
            "parameters": {"length": 80},
            "source": VALID_SOURCE,
        }
        response = Mock()
        response.status_code = 200
        response.text = "ok"
        response.json.return_value = {"choices": [{"message": {"content": json.dumps(payload)}}]}

        with patch.dict(
            "os.environ",
            {
                "CAD_SCRIPT_API_KEY": "test-key",
                "CAD_SCRIPT_MAX_TOKENS": "16000",
                "CAD_SCRIPT_TIMEOUT_SECONDS": "420",
            },
        ):
            with patch("cad_script_engine.llm_generator.requests.post", return_value=response) as post:
                generate_llm_build123d_source("make a complex support bracket")

        self.assertEqual(post.call_args.kwargs["json"]["max_tokens"], 16000)
        self.assertEqual(post.call_args.kwargs["timeout"], 420)

    def test_generate_llm_build123d_source_retries_when_first_response_has_no_json(self):
        empty_response = Mock()
        empty_response.status_code = 200
        empty_response.text = "ok"
        empty_response.json.return_value = {
            "choices": [
                {
                    "finish_reason": "length",
                    "message": {"content": "", "reasoning_content": "used all tokens"},
                }
            ]
        }
        payload = {
            "title": "Simplified Support Bracket",
            "geometryType": "bracket",
            "parameters": {"length": 120},
            "source": VALID_SOURCE,
        }
        good_response = Mock()
        good_response.status_code = 200
        good_response.text = "ok"
        good_response.json.return_value = {"choices": [{"message": {"content": json.dumps(payload)}}]}

        with patch.dict("os.environ", {"CAD_SCRIPT_API_KEY": "test-key"}):
            with patch(
                "cad_script_engine.llm_generator.requests.post",
                side_effect=[empty_response, good_response],
            ) as post:
                result = generate_llm_build123d_source("make a complex support bracket")

        self.assertEqual(result.title, "Simplified Support Bracket")
        self.assertEqual(post.call_count, 2)
        retry_user_prompt = post.call_args_list[1].kwargs["json"]["messages"][1]["content"]
        self.assertIn("simplified", retry_user_prompt.lower())

    def test_build_repair_prompt_includes_failure_and_source(self):
        prompt = build_repair_prompt("make a bracket", VALID_SOURCE, "NameError: Boxx")

        self.assertIn("NameError: Boxx", prompt)
        self.assertIn("make a bracket", prompt)
        self.assertIn("def gen_step", prompt)

    def test_generate_repaired_llm_source_reuses_llm_generation(self):
        with patch("cad_script_engine.llm_generator.generate_llm_build123d_source") as generate:
            generate.return_value.source = VALID_SOURCE

            source = generate_repaired_llm_source("make a bracket", "broken", "NameError")

        self.assertEqual(source, VALID_SOURCE)
        self.assertIn("NameError", generate.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
