import json
import sys
import unittest
from io import StringIO
from unittest.mock import patch

from cad_script_engine import cli
from cad_script_engine.generator_types import CadScript


class CliTest(unittest.TestCase):
    def test_generation_failure_returns_json_error_without_traceback(self):
        argv = [
            "cad_script_engine.cli",
            "--prompt",
            "make a complex support bracket",
            "--output-dir",
            "unused-output",
        ]

        with patch.object(sys, "argv", argv):
            with patch("cad_script_engine.cli.generate_build123d_source", side_effect=ValueError("LLM response JSON is invalid")):
                with patch("sys.stdout", new_callable=StringIO) as stdout:
                    exit_code = cli.main()

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 2)
        self.assertFalse(payload["success"])
        self.assertIn("LLM response JSON is invalid", payload["error"])
        self.assertNotIn("Traceback", stdout.getvalue())

    def test_llm_generation_failure_falls_back_to_local_generator(self):
        argv = [
            "cad_script_engine.cli",
            "--prompt",
            "CAD\u652f\u5ea7 \u5e95\u5ea7\u957f120 \u5bbd80 \u539a15",
            "--output-dir",
            "unused-output",
        ]
        local_script = CadScript(
            title="Support Bracket",
            geometry_type="support_bracket",
            source="from build123d import *\n\n\ndef gen_step():\n    return Box(120, 80, 75)\n",
            parameters={"baseLength": 120.0},
        )

        with patch.dict("os.environ", {"CAD_SCRIPT_GENERATOR": "llm"}):
            with patch.object(sys, "argv", argv):
                with patch("cad_script_engine.cli.generate_build123d_source", side_effect=RuntimeError("Response ended prematurely")):
                    with patch("cad_script_engine.cli.generate_local_build123d_source", return_value=local_script):
                        with patch("cad_script_engine.cli.write_source") as write_source:
                            write_source.return_value.__str__.return_value = "source.py"
                            with patch("cad_script_engine.cli.resolve_output_path", return_value="part.step"):
                                with patch("cad_script_engine.cli.export_with_optional_repair") as export:
                                    export.return_value = type("Result", (), {"exported": True, "attempts": 1, "source": local_script.source, "error": None})()
                                    with patch("sys.stdout", new_callable=StringIO) as stdout:
                                        exit_code = cli.main()

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertTrue(payload["success"])
        self.assertEqual(payload["fallback"], "local")
        self.assertEqual(payload["geometryType"], "support_bracket")

    def test_llm_export_failure_falls_back_to_local_generator(self):
        argv = [
            "cad_script_engine.cli",
            "--prompt",
            "CAD\u652f\u5ea7 \u5e95\u5ea7\u957f120 \u5bbd80 \u539a15",
            "--output-dir",
            "unused-output",
        ]
        llm_script = CadScript(
            title="LLM Bracket",
            geometry_type="bracket",
            source="from build123d import *\n\n\ndef gen_step():\n    return Box(1, 1, 1)\n",
            parameters={},
        )
        local_script = CadScript(
            title="Support Bracket",
            geometry_type="support_bracket",
            source="from build123d import *\n\n\ndef gen_step():\n    return Box(120, 80, 75)\n",
            parameters={"baseLength": 120.0},
        )

        with patch.dict("os.environ", {"CAD_SCRIPT_GENERATOR": "llm"}):
            with patch.object(sys, "argv", argv):
                with patch("cad_script_engine.cli.generate_build123d_source", return_value=llm_script):
                    with patch("cad_script_engine.cli.generate_local_build123d_source", return_value=local_script) as local_generate:
                        with patch("cad_script_engine.cli.write_source") as write_source:
                            write_source.return_value.parent.mkdir.return_value = None
                            write_source.return_value.__str__.return_value = "source.py"
                            with patch("cad_script_engine.cli.resolve_output_path", return_value="part.step"):
                                with patch("cad_script_engine.cli.export_with_optional_repair") as export:
                                    export.side_effect = [
                                        type("Result", (), {"exported": False, "attempts": 2, "source": llm_script.source, "error": "bad chamfer"})(),
                                        type("Result", (), {"exported": True, "attempts": 1, "source": local_script.source, "error": None})(),
                                    ]
                                    with patch("sys.stdout", new_callable=StringIO) as stdout:
                                        exit_code = cli.main()

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertTrue(payload["success"])
        self.assertEqual(payload["geometryType"], "support_bracket")
        self.assertEqual(payload["fallback"], "local")
        local_generate.assert_called_once()


if __name__ == "__main__":
    unittest.main()
