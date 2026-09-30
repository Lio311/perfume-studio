const fs = require('fs');

let code = fs.readFileSync('src/scene/materials.tsx', 'utf8');

if (!code.includes('MeshTransmissionMaterial')) {
  code = code.replace(
    'import * as THREE from "three";',
    'import * as THREE from "three";\nimport { MeshTransmissionMaterial } from "@react-three/drei";'
  );
  
  const returnPhysical = `  return (
    <meshPhysicalMaterial
      ref={meshRef}
      color={color}
      flatShading={flat}
      map={wood ?? paper?.map ?? null}
      bumpMap={fabric ?? leather ?? paper?.bump ?? wood ?? null}
      bumpScale={fabric ? 0.15 : leather ? 0.35 : paper ? 0.55 : wood ? 0.15 : 0}
      emissive="#000000"
      emissiveIntensity={0}
      metalness={metal ? 1 : 0}
      roughness={gp ? gp.roughness : metal ? 0.22 : matte ? 0.68 : finish === "wood" ? 0.7 : finish === "fabric" ? 0.95 : 0.84}
      sheen={finish === "fabric" ? 1 : matte ? 0.06 : 0}
      sheenRoughness={0.62}
      sheenColor={finish === "fabric" ? color : "#4a4f56"}
      transmission={gp ? gp.transmission : 0}
      thickness={gp ? gp.thickness : 0}
      ior={gp ? gp.ior : 1.5}
      clearcoat={gp ? 1 : metal ? 0.65 : finish === "fabric" ? 0 : 0.04}
      clearcoatRoughness={metal ? 0.12 : 0.04}
      attenuationColor={gp ? color : "#fff8ee"}
      attenuationDistance={gp ? 36 : 160}
      envMapIntensity={metal ? 1.65 : gp ? (cartonOpen ? 2.4 : 1.7) : matte ? 0.08 : 0.7}
      clippingPlanes={planes}
      specularIntensity={gp || metal ? 1 : matte ? 0.4 : 0.3}
      transparent={!!gp}
      opacity={gp ? gp.materialOpacity : 1}
      depthWrite={!gp}
      side={THREE.FrontSide}
    />
  );`

  const returnTransmission = `
  if (gp && !flat) {
    return (
      <MeshTransmissionMaterial
        ref={meshRef as any}
        color={color}
        roughness={gp.roughness}
        transmission={gp.transmission}
        thickness={gp.thickness * 1.5}
        ior={gp.ior}
        chromaticAberration={0.03}
        anisotropy={0.1}
        distortion={0.0}
        distortionScale={0.3}
        temporalDistortion={0.0}
        clearcoat={1}
        attenuationColor={color}
        attenuationDistance={36}
        envMapIntensity={cartonOpen ? 2.4 : 1.7}
        clippingPlanes={planes}
        side={THREE.FrontSide}
        background={new THREE.Color("#ffffff")}
        transparent
      />
    );
  }

  return (
    <meshPhysicalMaterial
      ref={meshRef}
      color={color}
      flatShading={flat}
      map={wood ?? paper?.map ?? null}
      bumpMap={fabric ?? leather ?? paper?.bump ?? wood ?? null}
      bumpScale={fabric ? 0.15 : leather ? 0.35 : paper ? 0.55 : wood ? 0.15 : 0}
      emissive="#000000"
      emissiveIntensity={0}
      metalness={metal ? 1 : 0}
      roughness={metal ? 0.22 : matte ? 0.68 : finish === "wood" ? 0.7 : finish === "fabric" ? 0.95 : 0.84}
      sheen={finish === "fabric" ? 1 : matte ? 0.06 : 0}
      sheenRoughness={0.62}
      sheenColor={finish === "fabric" ? color : "#4a4f56"}
      clearcoat={metal ? 0.65 : finish === "fabric" ? 0 : 0.04}
      clearcoatRoughness={metal ? 0.12 : 0.04}
      envMapIntensity={metal ? 1.65 : matte ? 0.08 : 0.7}
      clippingPlanes={planes}
      specularIntensity={metal ? 1 : matte ? 0.4 : 0.3}
      side={THREE.FrontSide}
    />
  );`

  code = code.replace(returnPhysical, returnTransmission);
  fs.writeFileSync('src/scene/materials.tsx', code);
}
