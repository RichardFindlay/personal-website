"""The island's meshes, from the scene description that figures/island/scene.mjs
writes. Builds every primitive, bakes soft ambient occlusion into the vertex
colours with Cycles, and exports one glTF binary for the page.

    blender -b --python figures/island/blender/island.py -- scene.json island.glb

All the geometry is decided in scene.mjs; nothing here places anything. The
scene's plan has y running south, so a point (x, y, z) goes to Blender's
(x, -y, z), and the glTF exporter turns that into the page's (x, z, y).
"""
import bmesh
import bpy
import json
import math
import sys
from mathutils import Euler, Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
args = sys.argv[sys.argv.index("--") + 1:]
SCENE, OUT = args[0], args[1]
data = json.load(open(SCENE))
SEA = data["seaLevel"]
TILE = data["tile"]


def linear(v):
    """An sRGB channel to linear light: Blender's colour attributes take linear values."""
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def hex_rgb(c):
    return tuple(linear(int(c[i:i + 2], 16) / 255) for i in (1, 3, 5))


def b(p):
    """A plan point to Blender's frame."""
    return Vector((p[0], -p[1], p[2]))


class Builder:
    """Collects faces for one mesh: shared vertices, a colour per face corner,
    and a smooth flag per face."""

    def __init__(self, name):
        self.name, self.verts, self.faces, self.colours, self.smooth = name, [], [], [], []
        self.vcols = {}  # per-vertex colours, for surfaces whose colours blend

    def vert(self, p):
        self.verts.append(tuple(p))
        return len(self.verts) - 1

    def face(self, idx, colour, out=None, smooth=False):
        """Adds a face; `out` is a point the face must look away from, or a
        direction it must look along, so the winding comes out right."""
        if out is not None:
            pts = [Vector(self.verts[i]) for i in idx]
            n = (pts[1] - pts[0]).cross(pts[2] - pts[0])
            if n.length < 1e-9 and len(pts) > 3:
                n = (pts[2] - pts[0]).cross(pts[3] - pts[0])
            centre = sum(pts, Vector()) / len(pts)
            ref = (centre - out[1]) if out[0] == "point" else out[1]
            if n.dot(ref) < 0:
                idx = list(reversed(idx))
        self.faces.append(list(idx))
        self.colours.append(colour)
        self.smooth.append(smooth)

    def build(self, material):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.verts, [], self.faces)
        mesh.polygons.foreach_set("use_smooth", self.smooth)
        col = mesh.color_attributes.new("col", "BYTE_COLOR", "CORNER")
        values = []
        loops = mesh.loops
        for poly, c in zip(mesh.polygons, self.colours):
            c = c or (1.0, 1.0, 1.0)
            for li in poly.loop_indices:
                v = self.vcols.get(loops[li].vertex_index, c)
                values.extend((v[0], v[1], v[2], 1.0))
        col.data.foreach_set("color", values)
        mesh.materials.append(material)
        mesh.validate()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


# ── Materials: one per kind; the page swaps in its own by name ──────────────
def material(name, rough=0.85):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "COLOR_0"
    links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    return m


MATERIALS = {}


def mat(name):
    if name not in MATERIALS:
        MATERIALS[name] = material(name)
    return MATERIALS[name]


def material_for(group):
    """A group's material: lights get their own; plain and painted parts share one."""
    if group == "static" or group.startswith("paint"):
        return "solid"
    return group.replace(":", "_")


# ── Primitive builders, each in the plan frame then turned into Blender's ───
def place(local, at, rot):
    v = Vector(local)
    if rot:
        v.rotate(Euler((rot[0], rot[1], rot[2]), "XYZ"))
    return b((at[0] + v.x, at[1] + v.y, at[2] + v.z))


def box(B, at, size, colour, rot=None):
    sx, sy, sz = size[0] / 2, size[1] / 2, size[2]
    corners = [(-sx, -sy, 0), (sx, -sy, 0), (sx, sy, 0), (-sx, sy, 0), (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
    vs = [B.vert(place(c, at, rot)) for c in corners]
    centre = place((0, 0, sz / 2), at, rot)
    for f in [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
        B.face([vs[i] for i in f], colour, ("point", centre))


def rbox(B, at, size, colour, rot=None, r=0.8, seg=2):
    """A box with chamfered edges, the toy look: its faces flat, its edges catching light."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], (v.co.z + 0.5) * size[2]))
    r = min(r, size[0] * 0.45, size[1] * 0.45, size[2] * 0.45)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=r, segments=seg, affect="EDGES", profile=0.5)
    idx = {v: B.vert(place(v.co, at, rot)) for v in bm.verts}
    centre = place((0, 0, size[2] / 2), at, rot)
    for f in bm.faces:
        B.face([idx[v] for v in f.verts], colour, ("point", centre))
    bm.free()


def gable(B, at, size, colour, rot=None):
    """A gable roof: its ridge along x, eaves across y, rising `size[2]`."""
    lx, ly, h = size[0] / 2, size[1] / 2, size[2]
    pts = [(-lx, -ly, 0), (lx, -ly, 0), (lx, ly, 0), (-lx, ly, 0), (-lx, 0, h), (lx, 0, h)]
    vs = [B.vert(place(p, at, rot)) for p in pts]
    centre = place((0, 0, h / 3), at, rot)
    for f in [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4), (0, 3, 2, 1)]:
        B.face([vs[i] for i in f], colour, ("point", centre))


def lathe(B, at, profile, seg, colour, rot=None, open_top=False, close_base=True, jitter=0.0, seed=0):
    """A solid of revolution about z: `profile` is [height, radius] pairs."""
    rings = []
    for k, (s, r) in enumerate(profile):
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            j = 1 + (jitter * math.sin(a * 3 + k * 1.7 + seed) * math.cos(a * 2 - k + seed * 0.3) if jitter else 0)
            ring.append(B.vert(place((r * j * math.cos(a), r * j * math.sin(a), s), at, rot)) if r > 1e-6 else None)
        if r <= 1e-6:
            ring = [B.vert(place((0, 0, s), at, rot))] * seg
        rings.append(ring)
    axis = lambda s: place((0, 0, s), at, rot)
    for k in range(len(rings) - 1):
        s_mid = (profile[k][0] + profile[k + 1][0]) / 2
        for i in range(seg):
            i2 = (i + 1) % seg
            a, b2, c, d = rings[k][i], rings[k][i2], rings[k + 1][i2], rings[k + 1][i]
            idx = [a, b2, c] if c == d else [a, b2, c, d] if a != b2 else [a, c, d]
            B.face(idx, colour, ("point", axis(s_mid)), smooth=True)
    if close_base and profile[0][1] > 1e-6:
        c = B.vert(axis(profile[0][0]))
        for i in range(seg):
            B.face([rings[0][i], rings[0][(i + 1) % seg], c], colour, ("dir", Vector((0, 0, -1))))
    if not open_top and profile[-1][1] > 1e-6:
        c = B.vert(axis(profile[-1][0]))
        for i in range(seg):
            B.face([rings[-1][i], rings[-1][(i + 1) % seg], c], colour, ("dir", Vector((0, 0, 1))))


def sphere(B, at, r, sub, colour, hemi=False, jitter=0.0, seed=0):
    rows = 4 + sub * 3
    seg = 6 + sub * 5
    profile = []
    for k in range(rows + 1):
        t = (k / rows) * (math.pi / 2 if hemi else math.pi)
        if hemi:
            profile.append((r * math.sin(t), r * math.cos(t)))
        else:
            profile.append((r - r * math.cos(t), r * math.sin(t)))
    base = at if hemi else (at[0], at[1], at[2] - r)
    lathe(B, base, profile, seg, colour, close_base=hemi, open_top=False, jitter=jitter, seed=seed)


def tube(B, points, r, colour, seg=6):
    """A pipe or wire along a polyline, its sections square to each leg."""
    pts = [Vector(p) for p in points]
    rings = []
    for k, p in enumerate(pts):
        t = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
        u = t.cross(Vector((0, 0, 1)))
        if u.length < 1e-3:
            u = t.cross(Vector((1, 0, 0)))
        u.normalize()
        v = t.cross(u)
        rings.append([B.vert(b(p + (u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg)) * r)) for i in range(seg)])
    for k in range(len(rings) - 1):
        mid = b((pts[k] + pts[k + 1]) / 2)
        for i in range(seg):
            i2 = (i + 1) % seg
            B.face([rings[k][i], rings[k][i2], rings[k + 1][i2], rings[k + 1][i]], colour, ("point", mid), smooth=True)


def quad(B, pts, colour, out):
    B.face([B.vert(b(p)) for p in pts], colour, out)


def prim(B, p, colour_override=None):
    c = hex_rgb(colour_override or p["colour"])
    k = p["kind"]
    if k == "box":
        box(B, p["at"], p["size"], c, p.get("rot"))
    elif k == "rbox":
        rbox(B, p["at"], p["size"], c, p.get("rot"), p.get("r", 0.8), p.get("seg", 2))
    elif k == "mesh":
        # an explicit surface from the scene: vertices, faces (wound in the plan's
        # frame, so reversed here for Blender's), a colour per vertex
        base = len(B.verts)
        for v in p["verts"]:
            B.vert(b(v))
        if "vcolours" in p:
            vc = p["vcolours"]
            for i in range(len(p["verts"])):
                B.vcols[base + i] = tuple(linear(vc[3 * i + j] / 255) for j in range(3))
        fcs = p.get("fcolours")
        for n, f in enumerate(p["faces"]):
            col = hex_rgb(fcs[n]) if fcs else c
            B.faces.append([base + i for i in reversed(f)])
            B.colours.append(col)
            B.smooth.append(p.get("smooth", True))
    elif k == "gable":
        gable(B, p["at"], p["size"], c, p.get("rot"))
    elif k == "cyl":
        r2 = p.get("r2", p["r"])
        lathe(B, p["at"], [(0, p["r"]), (p["h"], r2)], p.get("seg", 16), c, p.get("rot"))
    elif k == "lathe":
        lathe(B, p["at"], p["profile"], p.get("seg", 24), c, p.get("rot"), open_top=p.get("open", False), jitter=p.get("jitter", 0), seed=len(B.verts))
        if p.get("open"):
            # the dark inside of an open top, seen from above
            top_s, top_r = p["profile"][-1]
            lathe(B, p["at"], [(top_s - 1.5, top_r - p.get("wall", 0.8)), (top_s - 1.5, 0)], p.get("seg", 24), hex_rgb("#4d5456"), close_base=False)
    elif k == "sphere":
        sphere(B, p["at"], p["r"], p.get("sub", 2), c, hemi=p.get("hemi", False), jitter=p.get("jitter", 0), seed=len(B.verts))
    elif k == "tube":
        tube(B, p["points"], p["r"], c, p.get("seg", 6))
    elif k == "quad":
        quad(B, p["pts"], c, ("point", b(p.get("ref", [0, 0, 3]))))
    elif k == "quads":
        for q in p["quads"]:
            if "ref" in p:
                quad(B, q, c, ("point", b(p["ref"])))
            else:
                quad(B, q, c, ("dir", Vector((0, 0, 1))))
    elif k == "disc":
        # a flat ellipse on the south face, facing the viewer
        n, cx, cy, cz = 24, p["at"][0], p["at"][1], p["at"][2]
        centre = B.vert(b((cx, cy, cz)))
        ring = [B.vert(b((cx + p["r"] * math.cos(2 * math.pi * i / n), cy, cz + p["ry"] * math.sin(2 * math.pi * i / n)))) for i in range(n)]
        for i in range(n):
            B.face([centre, ring[i], ring[(i + 1) % n]], c, ("dir", Vector((0, -1, 0))))
    elif k == "bars":
        for a, z in p["bars"]:
            tube(B, [a, z], p["r"], c, 4)


def grid_ground():
    """The square tile's ground, cut faces and sea, from the grid form of the scene."""
    T = data["terrain"]
    # ── Terrain: the grid form, for a tile-shaped island ───────────────────────
    nx, ny, step = T["nx"], T["ny"], T["step"]
    terrain = Builder("terrain")
    for j in range(ny):
        for i in range(nx):
            terrain.vert(b((i * step, j * step, T["heights"][j * nx + i])))
    tcol = [tuple(linear(T["colours"][3 * n + k] / 255) for k in range(3)) for n in range(nx * ny)]
    for j in range(ny - 1):
        for i in range(nx - 1):
            a, b2, c, d = j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i
            terrain.faces.append([a, d, c, b2])  # +z normal in Blender's frame (y flipped)
            terrain.colours.append(None)
            terrain.smooth.append(True)
    terrain_obj = terrain.build(mat("ground"))
    # vertex colours rather than face colours, so the fields blend softly
    col = terrain_obj.data.color_attributes["col"]
    loops = terrain_obj.data.loops
    values = []
    for loop in loops:
        c = tcol[loop.vertex_index]
        values.extend((c[0], c[1], c[2], 1.0))
    col.data.foreach_set("color", values)

    # ── The cut faces ───────────────────────────────────────────────────────────
    S = data["sides"]
    sides = Builder("sides")
    layer_cols = [hex_rgb(c) for c in S["colours"]]
    mid = Vector((TILE["w"] / 2, -TILE["d"] / 2, 0))
    for edge in S["edges"]:
        for i in range(len(edge) - 1):
            p, q = edge[i], edge[i + 1]
            for l in range(len(layer_cols)):
                if p["z"][l] - p["z"][l + 1] < 0.02 and q["z"][l] - q["z"][l + 1] < 0.02:
                    continue
                pts = [b((p["x"], p["y"], p["z"][l])), b((q["x"], q["y"], q["z"][l])), b((q["x"], q["y"], q["z"][l + 1])), b((p["x"], p["y"], p["z"][l + 1]))]
                colour = layer_cols[l]
                centre = sum(pts, Vector()) / 4
                sides.face([sides.vert(v) for v in pts], colour, ("dir", Vector((centre.x - mid.x, centre.y - mid.y, 0))))
    bottom = [b((0, 0, -data["depth"])), b((TILE["w"], 0, -data["depth"])), b((TILE["w"], TILE["d"], -data["depth"])), b((0, TILE["d"], -data["depth"]))]
    sides.face([sides.vert(v) for v in bottom], layer_cols[-1], ("dir", Vector((0, 0, -1))))
    sides_obj = sides.build(mat("rock"))

    # ── The sea's surface, over the whole tile; the land rises through it ──────
    sea = Builder("sea")
    corners = [b((0, 0, SEA)), b((TILE["w"], 0, SEA)), b((TILE["w"], TILE["d"], SEA)), b((0, TILE["d"], SEA))]
    sea.face([sea.vert(v) for v in corners], hex_rgb("#2fb3d1"), ("dir", Vector((0, 0, 1))))
    sea.build(mat("water"))




    return [terrain_obj, sides_obj]


base_objs = grid_ground() if "terrain" in data else []

# ── Static primitives, one mesh per material group ─────────────────────────
groups = {}
for p in data["prims"]:
    g = p.get("group", "static")
    if g not in groups:
        groups[g] = Builder(g.replace(":", "_"))
    prim(groups[g], p)
static_objs = [B.build(mat(material_for(g))) for g, B in groups.items()]

# ── Prototypes: built at the origin far off, for the page to instance ──────
proto_objs = {}
for name, parts in data["protos"].items():
    by_group = {}
    for p in parts:
        g = p.get("group", "static")
        by_group.setdefault(g, Builder(f"proto_{name}__{g.replace(':', '_')}"))
        prim(by_group[g], p)
    proto_objs[name] = [B.build(mat(material_for(g))) for g, B in by_group.items()]

# the rotor: a hub and three tapered blades of unit radius, its axis along +x
rotor = Builder("proto_rotor__static")
white = hex_rgb("#f4f6f7")
sphere(rotor, (0, 0, 0), 0.045, 1, white)
for k in range(3):
    phi = 2 * math.pi * k / 3
    span = [0.03, 0.2, 0.5, 0.8, 1.0]
    chord = [0.06, 0.085, 0.06, 0.035, 0.012]
    lead, trail = [], []
    for s, cw in zip(span, chord):
        radial = Vector((0, math.cos(phi), math.sin(phi)))
        tangent = Vector((0, -math.sin(phi), math.cos(phi)))
        lead.append(radial * s + tangent * cw * 0.35)
        trail.append(radial * s - tangent * cw * 0.65)
    for n in range(len(span) - 1):
        for face, out in (([lead[n], lead[n + 1], trail[n + 1], trail[n]], Vector((1, 0, 0))), ([trail[n], trail[n + 1], lead[n + 1], lead[n]], Vector((-1, 0, 0)))):
            offs = 0.004 if out.x > 0 else -0.004
            rotor.face([rotor.vert(Vector((v.x + offs, -v.y, v.z))) for v in face], white, ("dir", Vector((out.x, 0, 0))))
proto_objs["rotor"] = [rotor.build(mat("solid"))]

# ── Instances, present only while the ground's shadows are baked ───────────
instance_objs = []
for inst in data["instances"]:
    for src in proto_objs[inst["proto"]]:
        o = bpy.data.objects.new(src.name + "_i", src.data)
        o.location = b(inst["at"])
        o.rotation_euler = (0, 0, -inst["rot"])
        o.scale = (inst["scale"],) * 3
        bpy.context.scene.collection.objects.link(o)
        instance_objs.append(o)

# ── Bake soft shadows (ambient occlusion) into the colours ─────────────────
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = int(data.get("bakeSamples", 48))
scene.world = bpy.data.worlds.new("world")
scene.world.light_settings.distance = 14
scene.render.bake.target = "VERTEX_COLORS"


def bake(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        ao = o.data.color_attributes.get("ao") or o.data.color_attributes.new("ao", "BYTE_COLOR", "CORNER")
        o.data.color_attributes.active_color = ao
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type="AO")


world_objs = [*base_objs, *static_objs]
bake(world_objs)

# the prototypes alone, each on a patch of ground far from the island
for o in instance_objs:
    bpy.data.objects.remove(o)
patch = Builder("patch")
pc = [b((-5000 - 40, -40, 0)), b((-5000 + 40, -40, 0)), b((-5000 + 40, 40, 0)), b((-5000 - 40, 40, 0))]
patch.face([patch.vert(v) for v in pc], (1, 1, 1), ("dir", Vector((0, 0, 1))))
patch_obj = patch.build(mat("patch"))
for name, objs in proto_objs.items():
    for o in objs:
        o.location = (-5000, 0, 0)
    bake(objs)
    for o in objs:
        o.location = (0, 0, 0)
bpy.data.objects.remove(patch_obj)

# ── Colour times shadow, as the one attribute the page reads ───────────────
def combine(o, strength=0.85):
    m = o.data
    base, ao = m.color_attributes["col"], m.color_attributes.get("ao")
    n = len(m.loops)
    bv, av = [0.0] * (4 * n), [1.0] * (4 * n)
    base.data.foreach_get("color", bv)
    if ao:
        ao.data.foreach_get("color", av)
    out = []
    for i in range(n):
        a = 1 - strength * (1 - av[4 * i])
        out.extend((bv[4 * i] * a, bv[4 * i + 1] * a, bv[4 * i + 2] * a, 1.0))
    final = m.color_attributes.new("COLOR_0", "BYTE_COLOR", "CORNER")
    final.data.foreach_set("color", out)
    if ao:
        m.color_attributes.remove(ao)
    m.color_attributes.remove(m.color_attributes["col"])
    m.color_attributes.active_color = m.color_attributes["COLOR_0"]


for o in list(bpy.context.scene.objects):
    if o.type == "MESH" and "col" in o.data.color_attributes:
        combine(o, 0.0 if o.name in ("sea", "water", "foam") else 0.7)

# prototypes hang under empties so the page finds each by name
for name, objs in proto_objs.items():
    root = bpy.data.objects.new(f"proto_{name}", None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        o.parent = root

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True,
                          export_vertex_color="MATERIAL", export_materials="EXPORT", export_extras=False)
print("island.glb written:", OUT)
