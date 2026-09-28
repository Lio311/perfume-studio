const THREE = require('three');
const c = new THREE.Color("#000000").lerp(new THREE.Color("#ffffff"), 1.0);
console.log('#' + c.getHexString());
