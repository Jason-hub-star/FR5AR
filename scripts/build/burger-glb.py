# ROBOTIS Burger STL 4장 → 우리 규약에 맞춘 GLB 한 장.
#
# 왜 조립을 여기서 하나 — URDF 가 부품을 관절 원점으로 흩어 놓는다. 런타임에 4장을 받아
# 자리를 잡으면 드로우콜 4개 + 자리 계산이 화면에 들어온다. **구울 때 한 번 하면 끝난다.**
#
# 우리 규약 (`parts.js` 머리) — 원점은 **바닥 중앙**, 정면은 **+Z**, 단위는 미터(glTF).
# ROS 는 Z-up · X-forward 라 축을 돌려 굽는다.
import bpy, sys, math, os
from mathutils import Vector

SRC = sys.argv[sys.argv.index('--') + 1]
OUT = sys.argv[sys.argv.index('--') + 2]
TARGET_TRIS = int(sys.argv[sys.argv.index('--') + 3])

# ── URDF 에서 읽은 배치 (base_footprint = 바닥 기준 · ROS 축)
#   base_link 는 바닥에서 +0.010, 그 안에서 visual 이 x -0.032 만큼 밀려 있다
PARTS = [
    ('burger_base.stl', (-0.032, 0.0,  0.010)),
    ('left_tire.stl',   ( 0.0,   0.08, 0.033)),
    ('right_tire.stl',  ( 0.0,  -0.08, 0.033)),
    ('lds.stl',         (-0.032, 0.0,  0.182)),
]

bpy.ops.wm.read_factory_settings(use_empty=True)

objs = []
for name, xyz in PARTS:
    path = os.path.join(SRC, name)
    bpy.ops.wm.stl_import(filepath=path)
    o = bpy.context.selected_objects[0]
    # **STL 은 밀리미터, URDF 원점은 미터다.** 이걸 안 맞추면 바퀴가 0.08mm 만 벌어져
    # 몸통에 파묻히고 폭이 30mm 부족해진다 (첫 판이 그랬다 — 147.8 대신 178 이어야 한다).
    o.scale = (0.001, 0.001, 0.001)
    bpy.ops.object.transform_apply(scale=True)
    o.location = Vector(xyz)
    objs.append(o)
    print(f'  들임 {name:18} 삼각 {len(o.data.polygons):>7,}')

# ── 하나로 합친다. **드로우콜 1개** — 지금 상자+원통 2개보다도 적다
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
m = bpy.context.active_object
m.name = 'turtlebot3_burger'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
raw = len(m.data.polygons)
print(f'  합침 삼각 {raw:,}')

# **꼭짓점을 안 붙인다.** 붙여 보니 감량기가 실루엣을 더 깎았다 (높이 191 → 186mm).
# 파일 크기는 삼각형당 74B 로 거의 안 변했다 — STL 은 면마다 법선이 달라 어차피 안 공유된다.
# ── 감량. 방 12m 안에서 180mm 짜리라 화면에서 수십 px 다 — 정밀도가 남는다
if raw > TARGET_TRIS:
    d = m.modifiers.new('dec', 'DECIMATE')
    d.ratio = TARGET_TRIS / raw
    bpy.ops.object.modifier_apply(modifier='dec')
print(f'  감량 삼각 {len(m.data.polygons):,}')

# ── 축·원점을 우리 규약으로. ROS +X(정면) → glTF +Z 가 되게 Z 축 −90°
m.rotation_euler = (0.0, 0.0, math.radians(-90))
bpy.ops.object.transform_apply(rotation=True)

# 바닥 중앙에 앉힌다 — 좌우·앞뒤는 가운데, 아래는 y=0 (glTF 축에서 위가 +Y)
bb = [m.matrix_world @ Vector(c) for c in m.bound_box]
mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
m.location = Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))
bpy.ops.object.transform_apply(location=True)

bb = [m.matrix_world @ Vector(c) for c in m.bound_box]
mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
# Blender Z-up → glTF Y-up: 내보내기가 Blender +Z 를 glTF +Y 로, +Y 를 −Z 로 옮긴다
print('  BLENDER bbox mm  x %.0f  y %.0f  z %.0f' % ((mx.x-mn.x)*1000, (mx.y-mn.y)*1000, (mx.z-mn.z)*1000))
print('  → GLTF  기대치   폭(x) %.0f  높이(y) %.0f  깊이(z) %.0f'
      % ((mx.x-mn.x)*1000, (mx.z-mn.z)*1000, (mx.y-mn.y)*1000))
print('  바닥 접지 mm %.1f' % (mn.z * 1000))

# **재질을 굽지 않는다** — 화면이 `mat.amr` 로 덮는다 (D62 화이트 모형 규약).
m.data.materials.clear()

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=False,
    export_yup=True,
    export_apply=True,
    export_materials='NONE',        # 재질·텍스처를 안 싣는다
    export_normals=True,
    export_texcoords=False,
    # **Draco 를 안 쓴다.** 144KB 로 줄지만 DRACOLoader + WASM 디코더(~200KB)를 또 받아야 해서
    # 합계로는 손해다. 압축 없이 두면 서버 gzip 이 전송량을 반으로 줄이고 의존성이 0 이다.
    export_draco_mesh_compression_enable=False,
)
print('  나옴 %s  %.0f KB' % (OUT, os.path.getsize(OUT) / 1024))
