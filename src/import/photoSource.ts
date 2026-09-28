/**
 * Phase 1 builds round parts on the client (see silhouette.ts + LatheGeometry).
 * A paid mesh API can implement the same save path later — do not call one from here.
 */
export interface PhotoTo3DSource {
  id: string;
  kind: "lathe" | "mesh-api";
}

export const lathePhotoSource: PhotoTo3DSource = { id: "lathe", kind: "lathe" };

/** Reserved for Tripo / Hunyuan3D. Phase 1 never invokes it. */
export interface MeshApiSource extends PhotoTo3DSource {
  kind: "mesh-api";
  generate?: (file: Blob) => Promise<{ url: string }>;
}
