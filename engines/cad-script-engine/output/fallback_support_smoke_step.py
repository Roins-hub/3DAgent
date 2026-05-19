from build123d import *


def gen_step():
    base_length = 120.000000
    base_width = 80.000000
    base_thickness = 15.000000
    plate_height = 60.000000
    plate_thickness = 20.000000
    shaft_center_height = 45.000000
    shaft_hole_diameter = 30.000000
    mounting_hole_diameter = 11.000000
    mounting_spacing_x = 85.000000
    mounting_spacing_y = 50.000000
    rib_thickness = 12.000000

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
