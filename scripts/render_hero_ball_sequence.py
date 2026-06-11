from __future__ import annotations

import json
import os
from pathlib import Path

import bpy


FRAME_START = 0
FRAME_END = 59
FPS = 30
BALL_OBJECT = "Foreground_Reball_Mesh_0"
CAMERA_OBJECT = "CAM_03_FLIGHT"
BALL_DELTA_SCALE = 3.4


def output_root() -> Path:
    root = os.environ.get("REBALL_HERO_OUT", "assets/hero-transition")
    path = Path(root)
    path.mkdir(parents=True, exist_ok=True)
    (path / "frames").mkdir(parents=True, exist_ok=True)
    return path


def keep_only_ball_scene() -> None:
    for obj in bpy.context.scene.objects:
        if obj.name == BALL_OBJECT:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.hide_render = False
        elif obj.type in {"CAMERA", "LIGHT"}:
            obj.hide_render = obj.name not in {CAMERA_OBJECT, "CAM03_Key_Light", "CAM03_Fill_Light"}
        else:
            obj.hide_render = True
            obj.hide_viewport = True

    ball = bpy.data.objects.get(BALL_OBJECT)
    camera = bpy.data.objects.get(CAMERA_OBJECT)
    if ball is None:
        raise RuntimeError(f"Missing ball object: {BALL_OBJECT}")
    if camera is None:
        raise RuntimeError(f"Missing camera object: {CAMERA_OBJECT}")
    ball.delta_scale = (BALL_DELTA_SCALE, BALL_DELTA_SCALE, BALL_DELTA_SCALE)
    bpy.context.scene.camera = camera


def configure_render(root: Path) -> None:
    scene = bpy.context.scene
    scene.frame_start = FRAME_START
    scene.frame_end = FRAME_END
    scene.render.fps = FPS
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1

    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 90
    scene.render.filepath = str(root / "frames" / "reball_ball_drop_")


def write_meta(root: Path) -> None:
    meta = {
        "frameCount": FRAME_END - FRAME_START + 1,
        "fps": FPS,
        "sourceBlend": r"C:\리볼_로스트볼\blender\reball_cam03_flight.blend",
        "mode": "2.5D transparent ball-only frame sequence",
        "transparentBackground": True,
        "ballDeltaScale": BALL_DELTA_SCALE,
        "excludedObjects": ["Foreground_FlagHole_Mesh_0", "Flag", "FlagPole", "CAM03_Subtle_Motion_Trail"],
        "failureCriteriaNotes": [
            "No grass island rendered in Blender sequence.",
            "No full 3D background rendered in Blender sequence.",
            "Final frame remains visible for web handoff into the grass/hole plate.",
        ],
        "frames": {
            "0": "frames/reball_ball_drop_0000.webp",
            "15": "frames/reball_ball_drop_0015.webp",
            "30": "frames/reball_ball_drop_0030.webp",
            "45": "frames/reball_ball_drop_0045.webp",
            "59": "frames/reball_ball_drop_0059.webp",
        },
    }
    (root / "reball_ball_drop_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    root = output_root()
    keep_only_ball_scene()
    configure_render(root)
    bpy.ops.render.render(animation=True)
    write_meta(root)


if __name__ == "__main__":
    main()
