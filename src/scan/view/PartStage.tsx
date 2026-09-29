import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildPartGeometry, type PartMeshInput } from "../mesh/partMesh.ts";
import { attachOrbit, type OrbitState } from "./touch.ts";

export function PartStage(props: PartMeshInput & { onReady?: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(props.onReady);
  readyRef.current = props.onReady;
  const latheKey = props.lathe?.join(",") ?? "";

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x07080c, 1);
    renderer.domElement.setAttribute("aria-label", "מודל תלת־ממד");
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.005, 20);
    const hemi = new THREE.HemisphereLight(0xf7f4ee, 0x2c2a26, 0.72);
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(0.45, 0.9, 0.7);
    const fill = new THREE.DirectionalLight(0xe6e1d6, 0.42);
    fill.position.set(-0.7, 0.35, 0.2);
    const rim = new THREE.DirectionalLight(0xffffff, 0.28);
    rim.position.set(-0.1, 0.4, -0.9);
    scene.add(hemi, key, fill, rim);

    const input: PartMeshInput = {
      kind: props.kind,
      widthMm: props.widthMm,
      heightMm: props.heightMm,
      depthMm: props.depthMm,
      lathe: props.lathe,
      color: props.color,
    };
    const geometry = buildPartGeometry(input);
    const material = new THREE.MeshStandardMaterial({
      color: props.color || "#d8d2c8",
      roughness: props.kind === "box" ? 0.62 : 0.38,
      metalness: 0.03,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const span = Math.max(props.widthMm, props.heightMm, Math.max(props.depthMm, 1)) * 0.001;
    const focus = new THREE.Vector3(0, (props.heightMm * 0.001) * 0.46, 0);
    const orbit: OrbitState = { yaw: 0.62, pitch: 0.28, distance: span * 2.7, panX: 0, panY: 0 };
    const look = new THREE.Vector3();

    const place = () => {
      const cp = Math.cos(orbit.pitch);
      look.set(focus.x + orbit.panX, focus.y + orbit.panY, focus.z);
      camera.position.set(
        look.x + Math.sin(orbit.yaw) * cp * orbit.distance,
        look.y + Math.sin(orbit.pitch) * orbit.distance,
        look.z + Math.cos(orbit.yaw) * cp * orbit.distance,
      );
      camera.lookAt(look);
    };

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (width < 2 || height < 2) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    let frame = 0;
    let stopped = false;
    const draw = () => {
      resize();
      place();
      renderer.render(scene, camera);
    };
    const loop = () => {
      if (stopped) return;
      draw();
      frame += 1;
      if (frame === 2) readyRef.current?.();
      requestAnimationFrame(loop);
    };
    const detach = attachOrbit(renderer.domElement, orbit, { min: span * 0.7, max: span * 8 }, draw);
    const observer = new ResizeObserver(draw);
    observer.observe(mount);
    loop();

    return () => {
      stopped = true;
      detach();
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [props.kind, props.widthMm, props.heightMm, props.depthMm, props.color, latheKey]);

  return (
    <div className="viewer">
      <div ref={mountRef} className="viewer-canvas" dir="ltr" />
      <div className="dim-overlay" dir="rtl">
        <span><b><bdi dir="ltr">{props.widthMm.toFixed(2)}</bdi></b>רוחב</span>
        <span><b><bdi dir="ltr">{props.heightMm.toFixed(2)}</bdi></b>גובה</span>
        <span><b><bdi dir="ltr">{props.depthMm.toFixed(2)}</bdi></b>עומק</span>
        <em>מ״מ</em>
      </div>
    </div>
  );
}
