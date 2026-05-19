# CAD Script Engine Implementation Plan

Goal: add a first vertical slice for natural-language industrial CAD that generates build123d Python, exports STEP, and returns metadata through the existing CADAM workflow.

Architecture: keep the heavy OpenCascade/build123d runtime in a separate Python module under `engines/cad-script-engine`, called by the existing FastAPI app as a subprocess. The first implementation includes a deterministic local generator for square/cuboid blocks and flanges, plus interfaces that can later swap in DeepSeek-generated build123d source and repair loops.

Scope for this pass:
- Create a script engine package with a safe output directory, source generation, STEP export, and STEP fact counting.
- Add tests that run without build123d installed by validating source generation and safety checks.
- Add optional live export support when build123d is available.
- Add a FastAPI route path later to call this engine from CADAM/ParamCAD.

Files:
- Create `engines/cad-script-engine/cad_script_engine/__init__.py`
- Create `engines/cad-script-engine/cad_script_engine/generator.py`
- Create `engines/cad-script-engine/cad_script_engine/runner.py`
- Create `engines/cad-script-engine/cad_script_engine/cli.py`
- Create `engines/cad-script-engine/tests/test_generator.py`
- Create `engines/cad-script-engine/tests/test_runner.py`
- Create `engines/cad-script-engine/requirements.txt`

Validation:
- `python -m pytest engines/cad-script-engine/tests -q`
- If build123d is installed: `python -m cad_script_engine.cli --prompt "生成一个80mm圆法兰，中心30mm通孔，6个安装孔" --output-dir engines/cad-script-engine/output`
