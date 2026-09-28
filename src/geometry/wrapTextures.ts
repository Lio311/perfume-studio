import * as THREE from "three";
import paperColorUrl from "../assets/textures/paper-color.jpg";
import paperRoughUrl from "../assets/textures/paper-rough.jpg";
import velvetColorUrl from "../assets/textures/velvet-color.jpg";
import velvetRoughUrl from "../assets/textures/velvet-rough.jpg";

function load(url: string, color: boolean): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.5, 1.5);
  tex.anisotropy = 8;
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

let paper: { map: THREE.Texture; rough: THREE.Texture } | null = null;
let velvet: { map: THREE.Texture; rough: THREE.Texture } | null = null;

export function paperMaps(): { map: THREE.Texture; rough: THREE.Texture } {
  paper ??= { map: load(paperColorUrl, true), rough: load(paperRoughUrl, false) };
  return paper;
}

export function velvetMaps(): { map: THREE.Texture; rough: THREE.Texture } {
  velvet ??= { map: load(velvetColorUrl, true), rough: load(velvetRoughUrl, false) };
  return velvet;
}
