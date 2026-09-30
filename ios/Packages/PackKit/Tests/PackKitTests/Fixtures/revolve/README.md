# Shared revolve fixtures

These three cases are the contract between PackKit's `MeshBuilder` and the web lathe
(`src/import/lathe.ts`). The web lead can copy this folder to `fixtures/packkit/revolve/` later.
Nothing outside `ios/` is changed by the iOS task that added them.

## How the numbers were produced

`src/import/lathe.ts` revolves a profile with `THREE.LatheGeometry(points, 128)`:

- `y = index / (n - 1) * height`
- `radius = max(0.1, sample * (widthMm / 2))`  (`0.1` is millimetres)
- a centre point is inserted at the first and last height (`points.unshift` / `points.push`)
- `128` is the radial segment count (the second argument). There is no named constant in that file.
- the seam column is duplicated (`segments + 1` columns) so `u` goes from 0 to 1 around the part and `v` goes up

The 0.04…1.2 sample clamp is **not** inside `latheGeometry`. The scanner applies it when the pack is written (`src/scan/export/pack.ts`).

Expected **ring positions** and the **bounding box** below were computed by running that function under `npx tsx` against `three` (the positions Three stores in the position attribute, divided by 1000 to convert millimetres to metres). `firstRingMeters` is the bottom profile ring (not the centre cap point), columns 0 through 7. Column 0 is phi 0, which Three places on **+Z** (`x = r sin φ`, `z = r cos φ`).

`web.vertexCount` and `web.indexCount` are the raw `LatheGeometry` counts from that run:

- vertices = `(128 + 1) * (profile.length + 2)`
- indices = `128 * (profile.length + 1) * 6`

PackKit's `expected.vertexCount` / `expected.indexCount` are **not** those counts. The caps are separate fans with their own ring vertices so the crease at the cap stays a hard edge (`computeVertexNormals()` in the web smooths it). The side positions match the web.

- vertices = `(128 + 1) * profile.length + 2 * (128 + 1 + 1)`
- indices = `128 * profile.length * 6`

## File shape

```json
{
  "name": "cylinder-bottle",
  "kind": "bottle",
  "widthMm": 50,
  "heightMm": 120,
  "depthMm": 50,
  "color": "#f4f0e8",
  "finish": "clear",
  "profile": [1, 1],
  "segments": 128,
  "web": { "vertexCount": 5676, "indexCount": 33024, "source": "src/import/lathe.ts" },
  "expected": {
    "vertexCount": 5678,
    "indexCount": 32256,
    "bboxMinM": [-0.025, 0, -0.025],
    "bboxMaxM": [0.025, 0.12, 0.025],
    "firstRingMeters": [[0, 0, 0.025]]
  }
}
```

`profile` is base → top, 1 = widest, the same array the pack stores on `lathe`. `bbox*M` is metres, Y-up, origin at the base centre.

## Cases

| File | What it is |
| --- | --- |
| `cylinder-bottle.json` | 42 samples of `1`. Width 50 mm, height 120 mm. |
| `shouldered-bottle.json` | The 42-sample lathe on bottle `GP-B50` in `Fixtures/b-v2-bottle-photo-cap-scan-price.json` (48.5 × 92 mm). Shoulder narrows to 0.3. |
| `cap.json` | The 42-sample lathe on cap `GP-ZC15` in that same pack (28.2 × 36 mm). |

A revolved part is circular, so the mesh depth equals the mesh width (the widest `sample * width`), not a separate `depthMm`, unless the profile's maximum is 1 and `depthMm` was stored equal to `widthMm`.

## Sample GLBs

`samples/cylinder.glb`, `samples/cap.glb`, and `samples/box.glb` are small binary glTF files written by `PackKit.exportGLB` (short profiles so each file stays under 200 KB). The same writer is what `GLBWriterTests` exercises.
