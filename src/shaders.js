import * as THREE from "three";

const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){
  float v=0.0; float a=0.5;
  for(int i=0;i<5;i++){v+=a*snoise(p);p*=2.03;a*=0.5;}
  return v;
}
`;

export const SKY_VERT = `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAG = `
uniform float uTime;
uniform float uHour;
uniform vec3 uSunDir;
varying vec3 vDir;
${NOISE}

void main(){
  vec3 dir = normalize(vDir);
  float elev = dir.y;
  float t = uHour;
  vec3 dayZenith = vec3(0.35, 0.55, 0.95);
  vec3 dayHorizon = vec3(0.78, 0.86, 0.95);
  vec3 dawnHorizon = vec3(0.95, 0.55, 0.35);
  vec3 dawnZenith = vec3(0.25, 0.28, 0.62);
  vec3 duskHorizon = vec3(0.98, 0.42, 0.28);
  vec3 duskZenith = vec3(0.22, 0.16, 0.48);
  vec3 nightZenith = vec3(0.04, 0.06, 0.18);
  vec3 nightHorizon = vec3(0.12, 0.14, 0.32);

  float morning = smoothstep(4.5, 7.0, t) * (1.0 - smoothstep(8.5, 11.0, t));
  float day = smoothstep(6.5, 9.5, t) * (1.0 - smoothstep(16.0, 18.2, t));
  float sunset = smoothstep(16.4, 18.0, t) * (1.0 - smoothstep(19.2, 21.0, t));
  float night = 1.0 - smoothstep(5.2, 7.4, t) + smoothstep(18.6, 20.6, t);
  night = clamp(night, 0.0, 1.0);

  vec3 col = mix(nightHorizon, nightZenith, clamp(elev * 0.9 + 0.2, 0.0, 1.0));
  col = mix(col, mix(dawnHorizon, dawnZenith, clamp(elev, 0.0, 1.0)), morning);
  col = mix(col, mix(dayHorizon, dayZenith, clamp(elev * 1.1, 0.0, 1.0)), day);
  col = mix(col, mix(duskHorizon, duskZenith, clamp(elev, 0.0, 1.0)), sunset);

  float sun = pow(max(dot(dir, normalize(uSunDir)), 0.0), 180.0);
  float glow = pow(max(dot(dir, normalize(uSunDir)), 0.0), 8.0);
  col += vec3(1.0, 0.86, 0.55) * sun * 1.4;
  col += vec3(1.0, 0.5, 0.22) * glow * (0.25 + sunset * 0.7);

  vec2 swirlP = dir.xz / max(0.15, dir.y * 0.65 + 0.55);
  float ang = atan(swirlP.y, swirlP.x);
  float rad = length(swirlP);
  float swirl = fbm(vec3(ang * 1.6 + rad * 2.2, rad * 3.4 - uTime * 0.015, uTime * 0.01));
  col += vec3(0.12, 0.16, 0.28) * swirl * (0.25 + night * 0.7);
  col += vec3(0.95, 0.78, 0.35) * max(swirl, 0.0) * sunset * 0.25;

  if (night > 0.35 && elev > 0.08) {
    float stars = smoothstep(0.72, 0.92, snoise(dir * 90.0));
    col += stars * night * vec3(0.95, 0.9, 0.7) * 0.85;
    float big = smoothstep(0.86, 0.98, snoise(dir * 28.0 + 9.0));
    col += big * night * vec3(1.0, 0.92, 0.55) * 0.55;
  }

  col += vec3(0.18, 0.22, 0.08) * fbm(dir * 3.0 + uTime * 0.02) * 0.12;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const WATER_VERT = `
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  vUv = uv;
  vec3 p = position;
  float w = sin(p.x * 0.35 + uTime * 0.6) * 0.08 + cos(p.z * 0.28 - uTime * 0.45) * 0.07;
  w += sin((p.x + p.z) * 0.15 + uTime * 0.2) * 0.12;
  p.y += w;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const WATER_FRAG = `
uniform float uTime;
uniform float uHour;
uniform vec3 uSkyTint;
varying vec2 vUv;
varying vec3 vWorld;
${NOISE}

void main(){
  vec2 uv = vUv * 8.0;
  float n = fbm(vec3(uv.x, uTime * 0.08, uv.y));
  float n2 = fbm(vec3(uv.y * 1.3, uTime * 0.05, uv.x * 0.8));
  vec3 deep = vec3(0.08, 0.18, 0.32);
  vec3 teal = vec3(0.22, 0.55, 0.58);
  vec3 gold = vec3(0.92, 0.72, 0.32);
  vec3 col = mix(deep, teal, 0.45 + n * 0.35);
  float spec = pow(max(n2, 0.0), 3.0);
  float sunset = smoothstep(16.5, 18.2, uHour) * (1.0 - smoothstep(19.0, 20.8, uHour));
  col = mix(col, gold, spec * (0.15 + sunset * 0.55));
  col = mix(col, uSkyTint, 0.22);
  float foam = smoothstep(0.55, 0.85, n);
  col += foam * vec3(0.85, 0.9, 0.8) * 0.08;
  gl_FragColor = vec4(col, 0.92);
}
`;

export function patchPainterly(material, opts = {}) {
  material.userData.uTime = { value: 0 };
  material.userData.uWind = { value: opts.wind ?? 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = material.userData.uTime;
    shader.uniforms.uWind = material.userData.uWind;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform float uWind;
        varying vec3 vWorldP;
        varying vec3 vObjP;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vObjP = position;
        float gust = uWind * sin(uTime * 0.7 + position.y * 1.4 + position.x * 0.3);
        transformed.x += gust * 0.04 * max(position.y, 0.0);
        transformed.z += gust * 0.03 * max(position.y, 0.0);`
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vWorldP = worldPosition.xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWorldP;
        varying vec3 vObjP;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){
          vec2 i=floor(p); vec2 f=fract(p);
          float a=hash(i); float b=hash(i+vec2(1.0,0.0));
          float c=hash(i+vec2(0.0,1.0)); float d=hash(i+vec2(1.0,1.0));
          vec2 u=f*f*(3.0-2.0*f);
          return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
        }`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float stroke = noise(vWorldP.xz * 2.4 + vWorldP.y * 1.6);
        float stroke2 = noise(vWorldP.xy * 3.1);
        diffuseColor.rgb *= 0.88 + stroke * 0.22;
        diffuseColor.rgb += (stroke2 - 0.5) * 0.06;
        float cool = smoothstep(0.15, 0.7, 1.0 - vWorldP.y * 0.04);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.82, 0.88, 1.08), cool * 0.18);
        `
      );
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => "painterly-v1-" + (opts.wind ?? 0);
  return material;
}

export function makeSky() {
  const geo = new THREE.SphereGeometry(420, 48, 32);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHour: { value: 6.2 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3) },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "sky";
  return mesh;
}

export function makeWater() {
  const geo = new THREE.PlaneGeometry(220, 90, 80, 40);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHour: { value: 12 },
      uSkyTint: { value: new THREE.Color(0x4a70a8) },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(8, -0.15, -52);
  mesh.name = "yamuna";
  return mesh;
}
