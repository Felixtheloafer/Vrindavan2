import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uHour: { value: 12 },
    uStrength: { value: 0.85 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uHour;
    uniform float uStrength;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 n = vUv * vec2(1.6, 1.0);
      float grain = fract(sin(dot(n + uHour, vec2(12.9898,78.233))) * 43758.5453);
      float vig = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5)));
      vec3 warm = vec3(1.06, 1.0, 0.92);
      vec3 cool = vec3(0.92, 0.95, 1.08);
      float sunset = smoothstep(16.4, 18.0, uHour) * (1.0 - smoothstep(19.2, 21.0, uHour));
      vec3 col = mix(c.rgb * cool, c.rgb * warm, 0.45 + sunset * 0.4);
      col += (grain - 0.5) * 0.035 * uStrength;
      col *= mix(1.0, vig, 0.35 * uStrength);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function makeComposer(renderer, scene, camera, quality) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (quality.bloom) {
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.18, 0.7, 0.85);
    composer.addPass(bloom);
  }
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return { composer, grade };
}
