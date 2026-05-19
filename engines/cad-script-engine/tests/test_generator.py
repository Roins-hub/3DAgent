import unittest
from unittest.mock import patch

from cad_script_engine.generator import generate_build123d_source


class GeneratorTest(unittest.TestCase):
    def test_cube_prompt_generates_box_source(self):
        result = generate_build123d_source(
            "\u751f\u6210\u4e00\u4e2a100mm\u6b63\u65b9\u4f53\u96f6\u4ef6"
        )

        self.assertEqual(result.title, "Cube")
        self.assertEqual(result.geometry_type, "box")
        self.assertEqual(result.parameters["length"], 100.0)
        self.assertEqual(result.parameters["width"], 100.0)
        self.assertEqual(result.parameters["height"], 100.0)
        self.assertIn("def gen_step():", result.source)
        self.assertIn("Box(length, width, height)", result.source)

    def test_flange_prompt_generates_bore_and_bolt_pattern_source(self):
        result = generate_build123d_source(
            "generate an 80mm circular flange, 10mm thickness, 30mm bore, "
            "60mm bolt circle, 6 bolt holes"
        )

        self.assertEqual(result.title, "Circular Flange")
        self.assertEqual(result.geometry_type, "flange")
        self.assertEqual(result.parameters["outerDiameter"], 80.0)
        self.assertEqual(result.parameters["thickness"], 10.0)
        self.assertEqual(result.parameters["boreDiameter"], 30.0)
        self.assertEqual(result.parameters["boltCircleDiameter"], 60.0)
        self.assertEqual(result.parameters["holeCount"], 6.0)
        self.assertEqual(result.parameters["holeDiameter"], 6.0)
        self.assertIn("for i in range(hole_count):", result.source)
        self.assertIn("Cylinder(bore_diameter / 2.0", result.source)

    def test_chinese_flange_prompt_generates_flange_source(self):
        result = generate_build123d_source(
            "\u751f\u6210\u4e00\u4e2a80mm\u5706\u6cd5\u5170\uff0c\u539a\u5ea610mm\uff0c"
            "\u4e2d\u5fc330mm\u901a\u5b54\uff0c60mm\u5206\u5e03\u5706\u4e0a6\u4e2a6mm\u5b89\u88c5\u5b54"
        )

        self.assertEqual(result.geometry_type, "flange")
        self.assertEqual(result.parameters["outerDiameter"], 80.0)
        self.assertEqual(result.parameters["thickness"], 10.0)
        self.assertEqual(result.parameters["boreDiameter"], 30.0)
        self.assertEqual(result.parameters["boltCircleDiameter"], 60.0)
        self.assertEqual(result.parameters["holeCount"], 6.0)
        self.assertEqual(result.parameters["holeDiameter"], 6.0)

    def test_support_bracket_prompt_generates_local_build123d_source(self):
        result = generate_build123d_source(
            "CAD\u652f\u5ea7 \u5e95\u5ea7\u957f120\u3001\u5bbd80\u3001\u539a15 "
            "\u7acb\u677f\u603b\u9ad860\u3001\u539a\u5ea620 "
            "\u5185\u5b54\u76f4\u5f84\u03a630\uff0c\u5b89\u88c5\u5730\u811a\u5b54 4\u4e2a "
            "\u5b54\u5f84\u03a611 \u52a0\u5f3a\u7b4b \u4e24\u4fa7\u52a0\u7b4b\u677f"
        )

        self.assertEqual(result.geometry_type, "support_bracket")
        self.assertEqual(result.parameters["baseLength"], 120.0)
        self.assertEqual(result.parameters["baseWidth"], 80.0)
        self.assertEqual(result.parameters["baseThickness"], 15.0)
        self.assertEqual(result.parameters["shaftHoleDiameter"], 30.0)
        self.assertEqual(result.parameters["mountingHoleDiameter"], 11.0)
        self.assertEqual(result.parameters["ribThickness"], 12.0)
        self.assertIn("mounting_hole_diameter", result.source)
        self.assertIn("rib_thickness", result.source)

    def test_llm_mode_delegates_to_llm_generator(self):
        with patch.dict("os.environ", {"CAD_SCRIPT_GENERATOR": "llm"}):
            with patch("cad_script_engine.generator.generate_llm_build123d_source") as llm_generate:
                llm_generate.return_value.title = "LLM Bracket"
                llm_generate.return_value.geometry_type = "bracket"
                llm_generate.return_value.source = "from build123d import *\n\ndef gen_step():\n    return Box(1, 1, 1)\n"
                llm_generate.return_value.parameters = {"length": 1.0}

                result = generate_build123d_source("make a custom mounting bracket")

        self.assertEqual(result.title, "LLM Bracket")
        llm_generate.assert_called_once_with("make a custom mounting bracket")


if __name__ == "__main__":
    unittest.main()
