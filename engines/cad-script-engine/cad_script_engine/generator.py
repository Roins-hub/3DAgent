from __future__ import annotations

import os
import re

from .generator_types import CadScript
from .llm_generator import generate_llm_build123d_source


def generate_build123d_source(prompt: str) -> CadScript:
    if os.getenv("CAD_SCRIPT_GENERATOR", "").strip().lower() == "llm":
        return generate_llm_build123d_source(prompt)
    return generate_local_build123d_source(prompt)


def generate_local_build123d_source(prompt: str) -> CadScript:
    text = prompt.lower()
    if _contains_any(text, "\u652f\u5ea7", "\u7acb\u677f", "\u52a0\u5f3a\u7b4b", "support bracket", "bracket"):
        return _support_bracket_source(text)
    if _contains_any(text, "\u6cd5\u5170", "flange"):
        return _flange_source(text)
    return _box_source(text)


def _box_source(text: str) -> CadScript:
    size = _first_number(text, 100.0)
    is_cube = _contains_any(text, "\u6b63\u65b9\u4f53", "\u7acb\u65b9\u4f53", "cube")
    length = size
    width = size if is_cube else _number_after(text, ("\u5bbd", "width"), 50.0)
    height = size if is_cube else _number_after(text, ("\u9ad8", "\u539a", "height", "thickness"), 50.0)
    source = f'''from build123d import *


def gen_step():
    length = {length:.6f}
    width = {width:.6f}
    height = {height:.6f}
    part = Box(length, width, height)
    part.label = "box_part"
    return part
'''
    return CadScript(
        title="Cube" if is_cube else "Cuboid Block",
        geometry_type="box",
        source=source,
        parameters={"length": length, "width": width, "height": height},
    )


def _flange_source(text: str) -> CadScript:
    numbers = _numbers(text)
    outer = _number_before_or_default(
        text,
        ("mm\u5706\u6cd5\u5170", "mm \u5706\u6cd5\u5170", "mm flange"),
        numbers[0] if numbers else 80.0,
    )
    thickness = _number_after(text, ("\u539a\u5ea6", "\u539a", "thickness"), numbers[1] if len(numbers) > 1 else 10.0)
    bore = _number_after(text, ("\u4e2d\u5fc3", "\u901a\u5b54", "bore"), numbers[2] if len(numbers) > 2 else 30.0)
    bolt_circle = _number_after(text, ("\u5206\u5e03\u5706", "bolt circle", "pcd"), numbers[3] if len(numbers) > 3 else 60.0)
    hole_count = _hole_count(text, 6.0)
    hole_diameter = _hole_diameter(text, numbers[4] if len(numbers) > 4 else 6.0)
    source = f'''from math import cos, pi, sin
from build123d import *


def gen_step():
    outer_diameter = {outer:.6f}
    thickness = {thickness:.6f}
    bore_diameter = {bore:.6f}
    bolt_circle_diameter = {bolt_circle:.6f}
    hole_count = {int(hole_count)}
    hole_diameter = {hole_diameter:.6f}

    flange = Cylinder(outer_diameter / 2.0, thickness)
    bore = Cylinder(bore_diameter / 2.0, thickness + 2.0)
    result = flange - bore

    bolt_radius = bolt_circle_diameter / 2.0
    for i in range(hole_count):
        angle = 2.0 * pi * i / hole_count
        x = bolt_radius * cos(angle)
        y = bolt_radius * sin(angle)
        cutter = Pos(x, y, 0) * Cylinder(hole_diameter / 2.0, thickness + 2.0)
        result = result - cutter

    result.label = "circular_flange"
    return result
'''
    return CadScript(
        title="Circular Flange",
        geometry_type="flange",
        source=source,
        parameters={
            "outerDiameter": outer,
            "thickness": thickness,
            "boreDiameter": bore,
            "boltCircleDiameter": bolt_circle,
            "holeCount": hole_count,
            "holeDiameter": hole_diameter,
        },
    )


def _support_bracket_source(text: str) -> CadScript:
    numbers = _numbers(text)
    base_length = _number_after(text, ("\u5e95\u5ea7\u957f", "base length", "length"), numbers[0] if len(numbers) > 0 else 120.0)
    base_width = _number_after(text, ("\u5bbd", "base width", "width"), numbers[1] if len(numbers) > 1 else 80.0)
    base_thickness = _number_after(text, ("\u5e95\u5ea7\u539a", "\u539a", "base thickness"), numbers[2] if len(numbers) > 2 else 15.0)
    plate_height = _number_after(text, ("\u7acb\u677f\u603b\u9ad8", "\u7acb\u677f\u9ad8", "plate height"), 60.0)
    plate_thickness = _number_after(text, ("\u7acb\u677f\u539a\u5ea6", "\u7acb\u677f\u539a", "plate thickness"), 20.0)
    shaft_center_height = _number_after(text, ("\u4e2d\u5fc3\u8ddd\u5e95\u5ea7\u5e95\u9762\u9ad8\u5ea6", "\u5b54\u4e2d\u5fc3\u9ad8", "hole center height"), 45.0)
    shaft_hole_diameter = _diameter_after(text, ("\u5185\u5b54\u76f4\u5f84", "\u8f74\u5b54", "shaft hole"), 30.0)
    mounting_hole_diameter = _diameter_after(text, ("\u5b54\u5f84", "\u5730\u811a\u5b54", "mounting hole"), 11.0, prefer_phi=True)
    mounting_spacing_x = _number_after(text, ("\u5de6\u53f3\u5b54\u4e2d\u5fc3\u8ddd", "mounting spacing x"), 85.0)
    mounting_spacing_y = _number_after(text, ("\u524d\u540e\u5b54\u4e2d\u5fc3\u8ddd", "mounting spacing y"), 50.0)
    rib_thickness = _number_after(text, ("\u7b4b\u677f\u539a\u5ea6", "\u7b4b\u677f\u539a", "rib thickness"), 12.0)
    source = f'''from build123d import *


def gen_step():
    base_length = {base_length:.6f}
    base_width = {base_width:.6f}
    base_thickness = {base_thickness:.6f}
    plate_height = {plate_height:.6f}
    plate_thickness = {plate_thickness:.6f}
    shaft_center_height = {shaft_center_height:.6f}
    shaft_hole_diameter = {shaft_hole_diameter:.6f}
    mounting_hole_diameter = {mounting_hole_diameter:.6f}
    mounting_spacing_x = {mounting_spacing_x:.6f}
    mounting_spacing_y = {mounting_spacing_y:.6f}
    rib_thickness = {rib_thickness:.6f}

    base = Box(base_length, base_width, base_thickness)
    base = base.translate((0, 0, base_thickness / 2.0))

    plate = Box(base_length, plate_thickness, plate_height)
    plate = plate.translate((0, 0, base_thickness + plate_height / 2.0))
    part = base + plate

    shaft_hole = Cylinder(shaft_hole_diameter / 2.0, plate_thickness + 4.0)
    shaft_hole = shaft_hole.rotate(Axis.X, 90).translate((0, 0, shaft_center_height))
    part = part - shaft_hole

    for x in (-mounting_spacing_x / 2.0, mounting_spacing_x / 2.0):
        for y in (-mounting_spacing_y / 2.0, mounting_spacing_y / 2.0):
            hole = Cylinder(mounting_hole_diameter / 2.0, base_thickness + 4.0)
            hole = hole.translate((x, y, base_thickness / 2.0))
            part = part - hole

    rib_length = base_width / 2.0 - plate_thickness / 2.0
    rib_height = min(plate_height * 0.65, rib_length)
    for x in (-base_length * 0.25, base_length * 0.25):
        for side in (-1, 1):
            rib = Box(rib_thickness, rib_length, rib_height)
            rib = rib.translate((x, side * (plate_thickness / 2.0 + rib_length / 2.0), base_thickness + rib_height / 2.0))
            part = part + rib

    part.label = "support_bracket"
    return part
'''
    return CadScript(
        title="Support Bracket",
        geometry_type="support_bracket",
        source=source,
        parameters={
            "baseLength": base_length,
            "baseWidth": base_width,
            "baseThickness": base_thickness,
            "plateHeight": plate_height,
            "plateThickness": plate_thickness,
            "shaftCenterHeight": shaft_center_height,
            "shaftHoleDiameter": shaft_hole_diameter,
            "mountingHoleDiameter": mounting_hole_diameter,
            "mountingSpacingX": mounting_spacing_x,
            "mountingSpacingY": mounting_spacing_y,
            "ribThickness": rib_thickness,
        },
    )


def _contains_any(text: str, *needles: str) -> bool:
    return any(needle.lower() in text for needle in needles)


def _numbers(text: str) -> list[float]:
    return [float(match.group(1)) for match in re.finditer(r"(\d+(?:\.\d+)?)\s*(?:mm|\u6beb\u7c73)?", text)]


def _first_number(text: str, default: float) -> float:
    values = _numbers(text)
    return values[0] if values else default


def _number_after(text: str, keywords: tuple[str, ...], default: float) -> float:
    for keyword in keywords:
        match = re.search(re.escape(keyword) + r"\s*(\d+(?:\.\d+)?)", text)
        if match:
            return float(match.group(1))
        match = re.search(r"(\d+(?:\.\d+)?)\s*(?:mm|\u6beb\u7c73)?\s*" + re.escape(keyword), text)
        if match:
            return float(match.group(1))
    return default


def _number_before_or_default(text: str, suffixes: tuple[str, ...], default: float) -> float:
    for suffix in suffixes:
        match = re.search(r"(\d+(?:\.\d+)?)\s*" + re.escape(suffix), text)
        if match:
            return float(match.group(1))
    return default


def _diameter_after(text: str, keywords: tuple[str, ...], default: float, prefer_phi: bool = False) -> float:
    for keyword in keywords:
        if prefer_phi:
            match = re.search(re.escape(keyword) + r".{0,8}?(?:\u03a6|\u03c6|phi|d)\s*(\d+(?:\.\d+)?)", text)
            if match:
                return float(match.group(1))
        match = re.search(re.escape(keyword) + r"\s*(?:\u03a6|\u03c6|phi|d)?\s*(\d+(?:\.\d+)?)", text)
        if match:
            return float(match.group(1))
        match = re.search(re.escape(keyword) + r".{0,8}?(?:\u03a6|\u03c6|phi|d)\s*(\d+(?:\.\d+)?)", text)
        if match:
            return float(match.group(1))
    return default


def _hole_count(text: str, default: float) -> float:
    match = re.search(
        r"(\d+)\s*(?:\u4e2a)?(?:\d+(?:\.\d+)?\s*(?:mm|\u6beb\u7c73)?)?\s*(?:\u5b89\u88c5\u5b54|bolt|holes?)",
        text,
    )
    return float(match.group(1)) if match else default


def _hole_diameter(text: str, default: float) -> float:
    matches = re.findall(
        r"(\d+(?:\.\d+)?)\s*(?:mm|\u6beb\u7c73)?\s*(?:\u5b89\u88c5\u5b54|\u87ba\u6813\u5b54|bolt holes?|holes?)",
        text,
    )
    return float(matches[-1]) if matches else default
