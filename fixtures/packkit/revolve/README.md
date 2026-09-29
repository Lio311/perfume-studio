# Revolve mesh contract

Shared with the iOS app's M7a. The web scanner revolves a round part with the same mesh as `src/import/lathe.ts` (`LatheGeometry`). These files are that mesh, converted from millimetres to metres. Match positions to 1e-6 m and match the index buffer exactly.

`bottle.json`, `cap.json`, and `sphere.json` are the inputs and the expected mesh. `bottle.glb` is the same bottle mesh written by three.js `GLTFExporter` (`binary: true`).

## Input

| File | Part | Height | Widest radius | Diameter |
| --- | --- | --- | --- | --- |
| `bottle.json` | bottle | 100 mm | 20 mm | 40 mm |
| `cap.json` | cap | 25 mm | 15 mm | 30 mm |
| `sphere.json` | sphere-ended | 52 mm | 26 mm | 52 mm |

`samples` is the schema `lathe`: 42 radii, base to top, `1` = widest. The scanner clamps saved samples to 0.04…1.2. `radiiMm` (before that clamp) is not stored here; the revolve uses the normalised samples.

Shape classification uses the silhouette before the cylinder-rim fill (`observedRadiiMm`, including sphere ends). The saved lathe, and therefore this revolve, is the profile after the 8% edge-row fill. A cylinder's thin rim is flattened. A sphere's ends are longer than 8% of the rows, so they stay in the saved profile. These fixtures are already that saved profile.

## Axis, units, seam

- Units in the JSON positions and in the GLB: metres. `lathe.ts` builds millimetres; divide by 1000. Do not leave a node scale.
- Y is up. The axis of revolution is Y.
- Origin: the base centre is at y = 0. X and Z are centred.
- Profile point `i` (0 = base, last = top), before the caps are inserted:

  `xMm = max(0.1, sample[i] * radiusMm)`

  `yMm = (i / (sampleCount - 1)) * heightMm`

  `vertex = (xMm, yMm, z from the sweep) * 0.001`

  The 0.1 mm floor is `lathe.ts` (`Math.max(0.1, sample * radius)`). It is not the schema clamp.
- Two cap points are inserted, both at radius 0: `(0, y of the first sample)` before the profile and `(0, y of the last sample)` after it. `pointCount = sampleCount + 2` (44 when there are 42 samples).
- Radial segment count: **128**. This is the second argument of `THREE.LatheGeometry` in `lathe.ts`. There are `segments + 1` = 129 meridians because the seam is duplicated.
- Seam position: phi starts at 0 and ends at 2π. A profile point at radius `r` and height `y` is

  `(r * sin(phi), y, r * cos(phi))`

  Phi 0 is the +Z meridian `(0, y, r)`. The last meridian repeats that position (the weld). Meridian `i` is `phi = i / 128 * 2π`.
- Vertex order: meridian `i` in `0…128`, and inside it profile point `j` in `0…pointCount-1` (base cap, then base → top, then top cap).

  `vertexIndex = j + i * pointCount`

## Winding and caps

`LatheGeometry` in three.js r186 (the version this repo pins) emits two triangles per quad. For meridian `i` and profile span `j`:

```
base = j + i * pointCount
a = base                  // (i, j)
b = base + pointCount     // (i+1, j)
c = base + pointCount + 1 // (i+1, j+1)
d = base + 1              // (i, j+1)
triangles: (a, b, d), (c, d, b)
```

The index buffer is that loop, `i` then `j`, with nothing else appended. The caps are not a fan added afterwards: the radius-0 points are normal profile rows, so the first and last band of quads are the base cap and the top cap. Those triangles use the same `(a, b, d) (c, d, b)` order. Winding faces outward (positive Y on the top cap, negative Y on the base cap).

`lathe.ts` calls `computeVertexNormals()` after building the geometry. That does not move vertices and does not change indices. Compare positions and indices, not the normal vectors.

## GLB

`bottle.glb` is GLB 2.0, binary, Y up, metres, one mesh, identity node transform. The POSITION accessor is the bottle vertex buffer above (float32). The first vertex is the base centre `(0, 0, 0)`. The next vertex on the seam is the first sample on +Z.
