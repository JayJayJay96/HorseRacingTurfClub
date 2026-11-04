import * as THREE from 'three';
import { finishS, trackPoint, type Track } from '../track.ts';
import type { Preset } from './lighting.ts';
import { PIXEL_M, TILE_M } from './look.ts';
import { placeScenery, standsRect } from './scenery.ts';
import { gradient, pixelTexture, scenerySprite, type PixelImage } from './textures.ts';

/** A pixel-sharp texture from a bottom-row-first image. */
export function toTexture(img: PixelImage, repeat: boolean): THREE.DataTexture {
  const tex = new THREE.DataTexture(img.data, img.width, img.height, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Lit, alpha-tested billboard material whose shadow keeps the cut-out shape. */
export function cutoutMaterials(map: THREE.Texture) {
  const material = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide });
  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map,
    alphaTest: 0.5,
  });
  return { material, depth };
}

/** A flat strip along the track between two offsets, uv in TILE_M units. */
function strip(track: Track, from: number, to: number, y: number, s0 = 0, s1 = track.lap) {
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const step = Math.min(2, (s1 - s0) / 2);
  let n = 0;
  for (let s = s0; s <= s1 + 1e-6; s += step, n++) {
    for (const off of [from, to]) {
      const p = trackPoint(track, s, off);
      pos.push(p.x, y, p.y);
      uv.push(s / TILE_M, off / TILE_M);
    }
    if (n > 0) {
      const a = (n - 1) * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A vertical band (the rail) along the track at `offset`, between heights y0 and y1. */
function band(track: Track, offset: number, y0: number, y1: number) {
  const pos: number[] = [];
  const index: number[] = [];
  let n = 0;
  for (let s = 0; s <= track.lap + 1e-6; s += 2, n++) {
    const p = trackPoint(track, s, offset);
    pos.push(p.x, y0, p.y, p.x, y1, p.y);
    if (n > 0) {
      const a = (n - 1) * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export interface World {
  readonly group: THREE.Group;
  /** Crowd rows, bobbed by the renderer; `userData.baseY` holds the rest height. */
  readonly crowd: THREE.Mesh[];
  /** Everything that turns to face the camera's yaw each frame. */
  readonly billboards: THREE.Object3D[];
  /** Top of the finish post, world coords (for confetti). */
  readonly finishTop: THREE.Vector3;
  readonly sky: THREE.DataTexture;
}

export function buildWorld(track: Track, lanes: number, seed: number, preset: Preset): World {
  const group = new THREE.Group();
  const outer = lanes * track.laneWidth;
  const billboards: THREE.Object3D[] = [];
  const crowd: THREE.Mesh[] = [];

  // Ground: grass everywhere.
  const size = 2400;
  const grassTex = toTexture(pixelTexture('grass', seed), true);
  grassTex.repeat.set(size / TILE_M, size / TILE_M);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: grassTex }),
  );
  ground.receiveShadow = true;
  group.add(ground);

  // Dirt track across all lanes.
  const dirt = new THREE.Mesh(
    strip(track, -2, outer + 2, 0.02),
    new THREE.MeshLambertMaterial({ map: toTexture(pixelTexture('dirt', seed + 1), true) }),
  );
  dirt.receiveShadow = true;
  group.add(dirt);

  // White rails (inner and outer) with posts every 6 m.
  const railMat = new THREE.MeshLambertMaterial({ color: '#f5f5f5', side: THREE.DoubleSide });
  const postGeo = new THREE.BoxGeometry(0.12, 1, 0.12);
  for (const offset of [-2.2, outer + 2.2]) {
    const rail = new THREE.Mesh(band(track, offset, 0.85, 1.0), railMat);
    rail.castShadow = true;
    group.add(rail);
    const count = Math.floor(track.lap / 6);
    const posts = new THREE.InstancedMesh(postGeo, railMat, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const p = trackPoint(track, i * 6, offset);
      posts.setMatrixAt(i, m.makeTranslation(p.x, 0.5, p.y));
    }
    posts.castShadow = true;
    group.add(posts);
  }

  // Finish line and post.
  const fs = finishS(track);
  group.add(
    new THREE.Mesh(
      strip(track, -2, outer + 2, 0.03, fs - 0.3, fs + 0.3),
      new THREE.MeshLambertMaterial({ color: '#ffffff' }),
    ),
  );
  const postAt = trackPoint(track, fs, outer + 3);
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 6, 0.3),
    new THREE.MeshLambertMaterial({ color: '#ffffff' }),
  );
  post.position.set(postAt.x, 3, postAt.y);
  post.castShadow = true;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1.2, 0.2),
    new THREE.MeshLambertMaterial({ color: '#e53935' }),
  );
  board.position.set(postAt.x, 6.4, postAt.y);
  board.castShadow = true;
  group.add(post, board);

  // Stands: 4 stepped wooden tiers, a crowd row on each, facing the track (-z).
  const s = standsRect(track, lanes);
  const width = s.x1 - s.x0 - 8;
  const cx = (s.x0 + s.x1) / 2;
  const woodTex = toTexture(pixelTexture('wood', seed + 2), true);
  woodTex.repeat.set(width / TILE_M, 1);
  const woodMat = new THREE.MeshLambertMaterial({ map: woodTex });
  const crowdTex = toTexture(pixelTexture('crowd', seed + 3, 32, 16), true);
  const crowdH = 16 * PIXEL_M;
  crowdTex.repeat.set(width / TILE_M, 1);
  const { material: crowdMat } = cutoutMaterials(crowdTex);
  for (let i = 0; i < 4; i++) {
    const h = 1.2 * (i + 1);
    const tier = new THREE.Mesh(new THREE.BoxGeometry(width, h, 6), woodMat);
    const z = s.y0 + 4 + 3 + i * 6;
    tier.position.set(cx, h / 2, z);
    tier.castShadow = tier.receiveShadow = true;
    group.add(tier);
    const row = new THREE.Mesh(new THREE.PlaneGeometry(width, crowdH).rotateY(Math.PI), crowdMat);
    row.position.set(cx, h + crowdH / 2, z - 1);
    row.userData.baseY = row.position.y;
    group.add(row);
    crowd.push(row);
  }

  // Scenery cut-outs: 4 variants per kind, shared textures.
  const looks = new Map<string, ReturnType<typeof cutoutMaterials> & { w: number; h: number }>();
  for (const item of placeScenery(track, lanes, seed)) {
    const key = `${item.kind}:${item.variant}`;
    let look = looks.get(key);
    if (!look) {
      const img = scenerySprite(item.kind, seed + item.variant);
      look = { ...cutoutMaterials(toTexture(img, false)), w: img.width, h: img.height };
      looks.set(key, look);
    }
    const geo = new THREE.PlaneGeometry(look.w * PIXEL_M, look.h * PIXEL_M);
    geo.translate(0, (look.h * PIXEL_M) / 2, 0);
    const mesh = new THREE.Mesh(geo, look.material);
    mesh.customDepthMaterial = look.depth;
    mesh.castShadow = true;
    mesh.position.set(item.x, 0, item.y);
    group.add(mesh);
    billboards.push(mesh);
  }

  // Night: four floodlight towers outside the track's corners, glowing heads (bloom).
  if (preset.floodlights) {
    const head = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#fff8e0').multiplyScalar(3),
    });
    const pole = new THREE.MeshLambertMaterial({ color: '#888888' });
    const corner = trackPoint(track, 0, outer + 30);
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      const x = sx * (Math.abs(corner.x) + 60);
      const z = sz * (Math.abs(corner.y) + 20);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.8, 28, 0.8), pole);
      tower.position.set(x, 14, z);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 1), head);
      lamp.position.set(x, 28, z);
      group.add(tower, lamp);
    }
  }

  // Sunset: soft additive light shafts in front of the stands.
  if (preset.shafts) {
    const shaftTex = toTexture(gradient('#000000', '#ffffff', 32), false);
    shaftTex.magFilter = shaftTex.minFilter = THREE.LinearFilter;
    const shaftMat = new THREE.MeshBasicMaterial({
      map: shaftTex,
      color: '#ffb070',
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 4; i++) {
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(6, 40), shaftMat);
      shaft.position.set(cx - width / 3 + (i * width) / 4.5, 20, s.y0 - 6);
      shaft.rotation.z = -0.35;
      group.add(shaft);
      billboards.push(shaft);
    }
  }

  const sky = toTexture(gradient(preset.sky[0], preset.sky[1], 64), false);
  sky.magFilter = sky.minFilter = THREE.LinearFilter;

  return {
    group,
    crowd,
    billboards,
    finishTop: new THREE.Vector3(postAt.x, 7, postAt.y),
    sky,
  };
}

/** Disposes every geometry, material and texture under `root`. */
export function disposeTree(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = mesh.material ? ([] as THREE.Material[]).concat(mesh.material) : [];
    if (mesh.customDepthMaterial) mats.push(mesh.customDepthMaterial);
    for (const m of mats) {
      materials.add(m);
      const map = (m as THREE.MeshBasicMaterial).map;
      if (map) textures.add(map);
    }
  });
  for (const m of materials) m.dispose();
  for (const t of textures) t.dispose();
}
