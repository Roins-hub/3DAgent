from math import cos, pi, sin
from build123d import *


def gen_step():
    outer_diameter = 80.000000
    thickness = 10.000000
    bore_diameter = 30.000000
    bolt_circle_diameter = 60.000000
    hole_count = 6
    hole_diameter = 6.000000

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
