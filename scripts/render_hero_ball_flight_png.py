# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy


FRAME_COUNT = 60
FPS = 30
WIDTH = 1920
HEIGHT = 1080
BALL_OBJECT = "Foreground_Reball_Mesh_0"
CAMERA_OBJECT = "HeroBallFlightCamera"
TRAIL_OBJECT = "HeroBallSubtleTrail"
OUTPUT_ROOT = Path("artifacts/hero-source/flight")
FRAMES_DIR = OUTPUT_ROOT / "frames"
ENABLE_TRAIL = False


def smoothstep(value: float) -> float:
    return value * value * (3.0 - 2.0 * value)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def catmull_rom(points: list[tuple[float, float]], t: float) -> tuple[float, float]:
    # The control points are normalized screen coordinates, where y=0 is top.
    count = len(points)
    scaled = min(count - 1.0001, max(0.0, t * (count - 1)))
    index = int(math.floor(scaled))
    local_t = smoothstep(scaled - index)

    p0 = points[max(0, index - 1)]
    p1 = points[index]
    p2 = points[min(count - 1, index + 1)]
    p3 = points[min(count - 1, index + 2)]

    def axis(values: tuple[float, float, float, float]) -> float:
        a0, a1, a2, a3 = values
        return 0.5 * (
            (2.0 * a1)
            + (-a0 + a2) * local_t
            + (2.0 * a0 - 5.0 * a1 + 4.0 * a2 - a3) * local_t * local_t
            + (-a0 + 3.0 * a1 - 3.0 * a2 + a3) * local_t * local_t * local_t
        )

    return axis((p0[0], p1[0], p2[0], p3[0])), axis((p0[1], p1[1], p2[1], p3[1]))


def screen_to_world(x: float, y: float) -> tuple[float, float, float]:
    # In Blender's orthographic camera for this setup, ortho_scale maps to
    # horizontal view width. Vertical view height is divided by aspect ratio.
    ortho_width = 4.5
    ortho_height = ortho_width / (WIDTH / HEIGHT)
    world_x = (x - 0.5) * ortho_width
    world_z = (0.5 - y) * ortho_height
    return world_x, 0.0, world_z


def flight_position(frame: int) -> tuple[float, float, float]:
    progress = frame / (FRAME_COUNT - 1)
    points = [
        (0.70, 0.30),
        (0.62, 0.39),
        (0.52, 0.51),
        (0.48, 0.72),
        (0.50, 0.88),
    ]
    x, y = catmull_rom(points, progress)
    return screen_to_world(x, y)


def ensure_camera() -> bpy.types.Object:
    camera = bpy.data.objects.get(CAMERA_OBJECT)
    if camera is None:
        camera_data = bpy.data.cameras.new(CAMERA_OBJECT)
        camera = bpy.data.objects.new(CAMERA_OBJECT, camera_data)
        bpy.context.collection.objects.link(camera)

    camera.location = (0.0, -8.0, 0.0)
    camera.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.5
    camera.data.lens = 70
    bpy.context.scene.camera = camera
    return camera


def configure_lights() -> None:
    for name, loc, power, size in [
        ("HeroBall_Key", (-2.0, -3.5, 3.2), 520.0, 4.0),
        ("HeroBall_Fill", (2.2, -4.0, 1.4), 110.0, 6.0),
    ]:
        light = bpy.data.objects.get(name)
        if light is None:
            data = bpy.data.lights.new(name, type="AREA")
            light = bpy.data.objects.new(name, data)
            bpy.context.collection.objects.link(light)
        light.location = loc
        light.data.energy = power
        light.data.size = size
        light.hide_render = False
        light.hide_viewport = False


def apply_white_ball_material(ball: bpy.types.Object) -> None:
    mat = bpy.data.materials.new("HeroBall_White_Dimple")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.98, 0.97, 0.93, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.62
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0.0
    ball.data.materials.clear()
    ball.data.materials.append(mat)


def normalize_ball(ball: bpy.types.Object) -> None:
    ball.animation_data_clear()
    ball.hide_set(False)
    ball.hide_viewport = False
    ball.hide_render = False
    ball.delta_scale = (1.0, 1.0, 1.0)
    ball.rotation_mode = "XYZ"
    bpy.context.view_layer.update()
    current_diameter = max(ball.dimensions)
    target_diameter = 0.42
    if current_diameter <= 0:
        return
    factor = target_diameter / current_diameter
    ball.scale = tuple(value * factor for value in ball.scale)
    bpy.context.view_layer.update()


def hide_non_ball_scene(ball: bpy.types.Object) -> None:
    keep_names = {ball.name, CAMERA_OBJECT, "HeroBall_Key", "HeroBall_Fill"}
    if ENABLE_TRAIL:
        keep_names.add(TRAIL_OBJECT)
    for obj in bpy.data.objects:
        if obj.name in keep_names:
            continue
        obj.hide_render = True
        obj.hide_viewport = True


def ensure_trail() -> bpy.types.Object:
    existing = bpy.data.objects.get(TRAIL_OBJECT)
    if existing:
        bpy.data.objects.remove(existing, do_unlink=True)

    curve = bpy.data.curves.new(TRAIL_OBJECT, type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = 0.006
    curve.bevel_resolution = 2

    mat = bpy.data.materials.new("HeroBall_Trail_Faint")
    mat.use_nodes = True
    mat.blend_method = "BLEND"
    mat.use_screen_refraction = False
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 0.09)
        bsdf.inputs["Alpha"].default_value = 0.09
        bsdf.inputs["Roughness"].default_value = 0.8
    curve.materials.append(mat)

    trail = bpy.data.objects.new(TRAIL_OBJECT, curve)
    bpy.context.collection.objects.link(trail)
    trail.hide_render = False
    trail.hide_viewport = False
    return trail


def update_trail(trail: bpy.types.Object, frame: int) -> None:
    curve = trail.data
    curve.splines.clear()
    start = max(0, frame - 14)
    positions = [flight_position(index) for index in range(start, frame + 1, 2)]
    if len(positions) < 2:
        positions = [flight_position(0), flight_position(0)]

    polyline = curve.splines.new("POLY")
    polyline.points.add(len(positions) - 1)
    for point, position in zip(polyline.points, positions):
        point.co = (position[0], position[1] + 0.035, position[2], 1.0)


def configure_render() -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"

    scene.frame_start = 0
    scene.frame_end = FRAME_COUNT - 1
    scene.render.fps = FPS
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"


def write_meta() -> None:
    meta = {
        "frameCount": 60,
        "fps": 30,
        "usage": "scroll-driven image sequence",
        "scrollDistanceRecommendation": "180vh to 240vh",
        "startFrame": 0,
        "endFrame": 59,
        "recommendedCss": {
            "position": "sticky",
            "top": "0",
            "height": "100vh",
        },
        "frameMapping": "frameIndex = Math.floor(progress * (frameCount - 1))",
        "transparentBackground": True,
        "renderedObjects": [BALL_OBJECT] if not ENABLE_TRAIL else [BALL_OBJECT, TRAIL_OBJECT],
        "excludedObjects": [
            "Foreground_FlagHole_Mesh_0",
            "Flag",
            "FlagPole",
            "Mesh_0.016",
            "Hero_View_Camera",
            "CAM03_Subtle_Motion_Trail",
        ],
        "trail": "removed for first-pass stability and UI clarity",
        "pathNotes": {
            "0000": "screen x 65-75%, y 25-35%",
            "0015": "upper to center transition",
            "0030": "screen center 45-55%, 45-55%",
            "0045": "entering lower commerce section",
            "0059": "screen x 45-55%, y 85-95%",
        },
    }
    (OUTPUT_ROOT / "hero_ball_flight_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)

    ball = bpy.data.objects.get(BALL_OBJECT)
    if ball is None:
        raise RuntimeError(f"Missing ball object: {BALL_OBJECT}")

    configure_render()
    ensure_camera()
    configure_lights()
    apply_white_ball_material(ball)
    normalize_ball(ball)
    trail = ensure_trail() if ENABLE_TRAIL else None
    hide_non_ball_scene(ball)

    for frame in range(FRAME_COUNT):
        bpy.context.scene.frame_set(frame)
        progress = frame / (FRAME_COUNT - 1)
        ball.location = flight_position(frame)
        ball.rotation_euler = (
            math.radians(28.0 * frame),
            math.radians(9.0 * frame),
            math.radians(-18.0 * frame),
        )
        # Slight scale ease keeps the object legible without changing the target landing point.
        size_boost = lerp(0.92, 1.08, smoothstep(progress))
        ball.delta_scale = (size_boost, size_boost, size_boost)
        if trail:
            update_trail(trail, frame)
        bpy.context.view_layer.update()
        bpy.context.scene.render.filepath = str(FRAMES_DIR / f"hero_ball_flight_{frame:04d}.png")
        bpy.ops.render.render(write_still=True)

    write_meta()


if __name__ == "__main__":
    main()
