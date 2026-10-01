const fs = require('fs');

let materials = fs.readFileSync('src/scene/materials.tsx', 'utf8');

materials = materials.replace(/import { MeshTransmissionMaterial } from "@react-three\/drei";\n/g, '');

const meshTransBlock = `  if (gp && !flat) {
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
        resolution={1024}
        samples={8}
      />
    );
  }`;

materials = materials.replace(meshTransBlock, '');

materials = materials.replace(
  'roughness={metal ? 0.22 : matte ? 0.68 : finish === "wood" ? 0.7 : finish === "fabric" ? 0.95 : 0.84}',
  'roughness={gp ? gp.roughness : metal ? 0.22 : matte ? 0.68 : finish === "wood" ? 0.7 : finish === "fabric" ? 0.95 : 0.84}'
);

materials = materials.replace(
  'clearcoat={metal ? 0.65 : finish === "fabric" ? 0 : 0.04}',
  `transmission={gp ? gp.transmission : 0}
      thickness={gp ? gp.thickness : 0}
      ior={gp ? gp.ior : 1.5}
      clearcoat={gp ? 1 : metal ? 0.65 : finish === "fabric" ? 0 : 0.04}`
);

materials = materials.replace(
  'clearcoatRoughness={metal ? 0.12 : 0.04}',
  `clearcoatRoughness={metal ? 0.12 : 0.04}
      attenuationColor={gp ? color : "#fff8ee"}
      attenuationDistance={gp ? 36 : 160}`
);

materials = materials.replace(
  'envMapIntensity={metal ? 1.65 : matte ? 0.08 : 0.7}',
  'envMapIntensity={metal ? 1.65 : gp ? (cartonOpen ? 2.4 : 1.7) : matte ? 0.08 : 0.7}'
);

materials = materials.replace(
  'specularIntensity={metal ? 1 : matte ? 0.4 : 0.3}',
  `specularIntensity={gp || metal ? 1 : matte ? 0.4 : 0.3}
      transparent={!!gp}
      opacity={gp ? gp.materialOpacity : 1}
      depthWrite={!gp}`
);

fs.writeFileSync('src/scene/materials.tsx', materials);
