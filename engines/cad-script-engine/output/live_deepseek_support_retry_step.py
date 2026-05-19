from build123d import *

def gen_step():
    # dimensions
    base_length = 120
    base_width = 80
    base_thickness = 15
    plate_thickness = 20
    total_height = 75
    hole_center_height = 45
    hole_diameter = 30
    hole_chamfer = 2
    mounting_hole_diameter = 11
    mounting_hole_spacing_x = 85
    mounting_hole_spacing_y = 50
    rib_thickness = 12
    rib_fillet_radius = 5
    base_corner_radius = 8
    outer_chamfer = 1

    # Base plate with rounded corners
    base_sk = RectangleRounded(base_length, base_width, base_corner_radius)
    base = extrude(base_sk, base_thickness)
    
    # Vertical plate centered on base
    plate = Box(base_length, plate_thickness, 60, align=Align.CENTER)
    plate = plate.translate((0, 0, 45))
    
    # Combine base and plate
    solid = base + plate
    
    # Shaft hole (through along Y)
    hole = Cylinder(hole_diameter/2, plate_thickness)
    hole = hole.rotate(Axis.X, 90).translate((0, 0, hole_center_height))
    solid = solid - hole
    
    # Chamfer hole edges
    hole_edges = solid.edges().filter_by(GeomType.CIRCLE)
    solid = chamfer(hole_edges, length=hole_chamfer)
    
    # Ribs
    with BuildSketch(Plane.YZ) as rib_sk:
        with BuildLine() as rib_ln:
            polyline((10, 15), (40, 15), (10, 45), (10, 15))
        make_face()
    rib1 = extrude(rib_sk, rib_thickness, both=True)
    rib2 = mirror(rib1, about=Plane.XZ)
    solid = solid + rib1 + rib2
    
    # Fillet on rib root edges
    edges_to_fillet = []
    for edge in solid.edges():
        if edge.geom_type == GeomType.LINE and edge.length < 50:
            v0, v1 = edge.vertices()
            if abs(v0.Z - 15) < 1e-6 and abs(v1.Z - 15) < 1e-6:
                for v in [v0, v1]:
                    if abs(abs(v.X) - 6) < 1e-3 and (10 <= v.Y <= 40 or -40 <= v.Y <= -10):
                        edges_to_fillet.append(edge)
                        break
            if abs(v0.Y - 10) < 1e-6 and abs(v1.Y - 10) < 1e-6:
                if 15 <= v0.Z <= 45 and 15 <= v1.Z <= 45 and abs(abs(v0.X)-6) < 1e-3 and abs(abs(v1.X)-6) < 1e-3:
                    edges_to_fillet.append(edge)
            if abs(v0.Y + 10) < 1e-6 and abs(v1.Y + 10) < 1e-6:
                if 15 <= v0.Z <= 45 and 15 <= v1.Z <= 45 and abs(abs(v0.X)-6) < 1e-3 and abs(abs(v1.X)-6) < 1e-3:
                    edges_to_fillet.append(edge)
    edges_to_fillet = list(set(edges_to_fillet))
    if edges_to_fillet:
        solid = fillet(edges_to_fillet, radius=rib_fillet_radius)
    
    # Mounting holes
    hole_pos = [(mounting_hole_spacing_x/2, mounting_hole_spacing_y/2),
                (mounting_hole_spacing_x/2, -mounting_hole_spacing_y/2),
                (-mounting_hole_spacing_x/2, mounting_hole_spacing_y/2),
                (-mounting_hole_spacing_x/2, -mounting_hole_spacing_y/2)]
    holes = []
    for (x, y) in hole_pos:
        h = Cylinder(mounting_hole_diameter/2, base_thickness)
        h = h.translate((x, y, base_thickness/2))
        holes.append(h)
    solid = solid - Compound(*holes)
    
    # Chamfer all outer sharp edges
    sharp_edges = solid.edges().filter_by(GeomType.LINE)
    solid = chamfer(sharp_edges, length=outer_chamfer)
    
    return solid
