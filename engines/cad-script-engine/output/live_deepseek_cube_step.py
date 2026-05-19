from build123d import *

def gen_step(side_length: float = 20) -> Solid:
    cube_box = Box(side_length, side_length, side_length)
    return cube_box
