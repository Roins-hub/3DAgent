from pathlib import Path
import unittest
from unittest.mock import patch


from cad_script_engine.runner import export_with_optional_repair, normalize_build123d_source, resolve_output_path


class RunnerTest(unittest.TestCase):
    def test_resolve_output_path_stays_inside_output_dir(self):
        output_dir = Path(__file__).parent / "tmp-output"
        output = resolve_output_path(output_dir, "part.step")

        self.assertEqual(output, output_dir.resolve() / "part.step")

    def test_resolve_output_path_rejects_traversal(self):
        output_dir = Path(__file__).parent / "tmp-output"
        with self.assertRaisesRegex(ValueError, "outside output directory"):
            resolve_output_path(output_dir, "../escape.step")

    def test_resolve_output_path_requires_step_suffix(self):
        output_dir = Path(__file__).parent / "tmp-output"
        with self.assertRaisesRegex(ValueError, "must end with .step"):
            resolve_output_path(output_dir, "part.stl")

    def test_export_with_optional_repair_retries_repaired_llm_source(self):
        output_dir = Path(__file__).parent / "tmp-output"
        source_path = output_dir / "repair_source.py"
        output_path = output_dir / "repair_source.step"
        repaired_source = "from build123d import *\n\n\ndef gen_step():\n    return Box(1, 1, 1)\n"

        with patch("cad_script_engine.runner.export_step_from_source") as export_step:
            export_step.side_effect = [RuntimeError("NameError: Boxx"), None]
            with patch("cad_script_engine.runner.generate_repaired_llm_source", return_value=repaired_source) as repair:
                result = export_with_optional_repair(
                    prompt="make a bracket",
                    source_path=source_path,
                    output_path=output_path,
                    source="broken source",
                    repair_enabled=True,
                )

        self.assertTrue(result.exported)
        self.assertEqual(result.attempts, 2)
        self.assertEqual(result.source, repaired_source)
        repair.assert_called_once()
        self.assertEqual(export_step.call_count, 2)

    def test_normalize_build123d_source_rewrites_common_chamfer_and_fillet_calls(self):
        source = (
            "solid = chamfer(solid, hole_edges, length=hole_chamfer)\n"
            "solid = fillet(solid, rib_edges, radius=rib_radius)\n"
        )

        normalized = normalize_build123d_source(source)

        self.assertIn("solid = chamfer(hole_edges, length=hole_chamfer)", normalized)
        self.assertIn("solid = fillet(rib_edges, radius=rib_radius)", normalized)


if __name__ == "__main__":
    unittest.main()
