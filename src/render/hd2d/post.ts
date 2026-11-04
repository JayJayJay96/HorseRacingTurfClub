import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import type { Preset } from './lighting.ts';
import { TILT_FOCUS } from './look.ts';

/** Colour grade + vignette in one pass (Look target 5). */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tint: { value: new THREE.Vector3(1, 1, 1) },
    saturation: { value: 1 },
    vignette: { value: 0.5 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 tint;
    uniform float saturation;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * tint;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      float d = length(vUv - 0.5) * 1.2;
      col *= 1.0 - vignette * smoothstep(0.25, 0.75, d);
      gl_FragColor = vec4(col, c.a);
    }`,
};

export interface Post {
  readonly composer: EffectComposer;
  setSize(width: number, height: number): void;
  /** Blur in screen px at the band edges. */
  setTilt(blurPx: number): void;
  dispose(): void;
}

export function buildPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  preset: Preset,
): Post {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const tiltH = new ShaderPass(HorizontalTiltShiftShader);
  const tiltV = new ShaderPass(VerticalTiltShiftShader);
  tiltH.uniforms.r!.value = TILT_FOCUS;
  tiltV.uniforms.r!.value = TILT_FOCUS;
  composer.addPass(tiltH);
  composer.addPass(tiltV);
  const { strength, radius, threshold } = preset.bloom;
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), strength, radius, threshold));
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.tint!.value = new THREE.Vector3(...preset.grade.tint);
  grade.uniforms.saturation!.value = preset.grade.saturation;
  grade.uniforms.vignette!.value = preset.grade.vignette;
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  let w = 1;
  let h = 1;
  let blur = 2;
  const apply = () => {
    tiltH.uniforms.h!.value = blur / w;
    tiltV.uniforms.v!.value = blur / h;
  };
  return {
    composer,
    setSize(width, height) {
      w = width;
      h = height;
      composer.setSize(width, height);
      apply();
    },
    setTilt(blurPx) {
      blur = blurPx;
      apply();
    },
    dispose() {
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
    },
  };
}
