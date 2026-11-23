import * as THREE from 'three';
import type {
  BotanicalSpeciesId,
  GourmetAreaSpec,
  PoolSpec,
  RoofFinishMaterial,
  RoofShapeType,
} from '../types/project';
import { getBotanicalMeta } from './landscaping';
import { createPoolTileTexture, createWaterRippleBumpTexture } from './proceduralTextures';

const frondTexCache = new Map<string, THREE.CanvasTexture>();
const leafClusterTexCache = new Map<string, THREE.CanvasTexture>();
const barkTexCache = new Map<string, THREE.CanvasTexture>();

function makeBarkTexture(hex: string, ringed: boolean): THREE.CanvasTexture {
  const key = `${hex}_${ringed ? 'ring' : 'bark'}`;
  const cached = barkTexCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 128, 256);

  if (ringed) {
    for (let y = 0; y < 256; y += 12) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, y, 128, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, y + 3, 128, 2);
    }
  } else {
    let s = 421;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(20,10,5,0.18)';
      ctx.fillRect(rand() * 124, rand() * 230, 3 + rand() * 5, 16 + rand() * 34);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  barkTexCache.set(key, tex);
  return tex;
}

function makePalmFrondTexture(mainHex: string, secHex: string): THREE.CanvasTexture {
  const key = `${mainHex}_${secHex}`;
  const cached = frondTexCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  // Central rachis stem
  ctx.strokeStyle = secHex;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(128, 250);
  ctx.lineTo(128, 12);
  ctx.stroke();

  // Pinnate leaflets
  const pairs = 19;
  for (let i = 1; i <= pairs; i++) {
    const t = i / (pairs + 1);
    const y = 244 - t * 224;
    const span = Math.sin(Math.PI * t) * 106 + 14;
    ctx.fillStyle = i % 2 === 0 ? mainHex : secHex;
    // Left leaflet
    ctx.beginPath();
    ctx.moveTo(128, y);
    ctx.quadraticCurveTo(128 - span * 0.55, y - 10, 128 - span, y - 22);
    ctx.quadraticCurveTo(128 - span * 0.5, y + 3, 128, y + 6);
    ctx.fill();
    // Right leaflet
    ctx.beginPath();
    ctx.moveTo(128, y);
    ctx.quadraticCurveTo(128 + span * 0.55, y - 10, 128 + span, y - 22);
    ctx.quadraticCurveTo(128 + span * 0.5, y + 3, 128, y + 6);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  frondTexCache.set(key, tex);
  return tex;
}

function makeCanopyFoliageTexture(
  mainHex: string,
  secHex: string,
  accentHex?: string,
  monstera = false,
): THREE.CanvasTexture {
  const key = `${mainHex}_${secHex}_${accentHex ?? ''}_${monstera ? 'm' : 'c'}`;
  const cached = leafClusterTexCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  if (monstera) {
    // Heart-shaped lobed Monstera leaf silhouette
    ctx.fillStyle = mainHex;
    ctx.beginPath();
    ctx.moveTo(128, 18);
    ctx.bezierCurveTo(222, 34, 240, 145, 195, 224);
    ctx.quadraticCurveTo(128, 242, 61, 224);
    ctx.bezierCurveTo(16, 145, 34, 34, 128, 18);
    ctx.fill();

    // Cutouts (fenestrations) using destination-out
    ctx.globalCompositeOperation = 'destination-out';
    for (let s = 0; s < 3; s++) {
      const cy = 78 + s * 44;
      ctx.beginPath();
      ctx.ellipse(62, cy, 42, 9, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(194, cy, 42, 9, 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = secHex;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(128, 240);
    ctx.lineTo(128, 32);
    ctx.stroke();
  } else {
    let s = 919;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    for (let i = 0; i < 65; i++) {
      const ang = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * 86;
      const lx = 128 + Math.cos(ang) * dist;
      const ly = 128 + Math.sin(ang) * dist;
      const rx = 16 + rand() * 14;
      const ry = 9 + rand() * 9;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rand() * Math.PI);
      ctx.fillStyle = i % 3 === 0 ? secHex : mainHex;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (accentHex) {
      for (let i = 0; i < 16; i++) {
        const ang = rand() * Math.PI * 2;
        const dist = rand() * 78;
        ctx.fillStyle = accentHex;
        ctx.beginPath();
        ctx.arc(128 + Math.cos(ang) * dist, 128 + Math.sin(ang) * dist, 5 + rand() * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  leafClusterTexCache.set(key, tex);
  return tex;
}

/**
 * Builds an architectural multi-part 3D botanical group for each of the 17 species.
 * Grounded cleanly at local y = 0.
 */
export function buildBotanicalPlant3D(
  speciesId: BotanicalSpeciesId,
  scale = 1,
  isSoftwareGl = false,
): THREE.Group {
  const meta = getBotanicalMeta(speciesId);
  const group = new THREE.Group();
  const s = Math.max(0.45, Math.min(1.8, scale));

  const castShadow = !isSoftwareGl;
  const barkMat = new THREE.MeshStandardMaterial({
    map: makeBarkTexture(meta.trunkHex, meta.category === 'palmeira' || speciesId === 'coqueiro_anao'),
    roughness: 0.9,
    metalness: 0.02,
  });

  // 1. Palms (Coqueiro Anao, Palmeira Imperial, Areca-Bambu)
  if (speciesId === 'palmeira_imperial' || speciesId === 'coqueiro_anao' || speciesId === 'palmeira_areca') {
    const frondTex = makePalmFrondTexture(meta.foliageHex, meta.secondaryFoliageHex);
    const frondMat = new THREE.MeshStandardMaterial({
      map: frondTex,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.62,
      metalness: 0.04,
    });

    const stemCount = speciesId === 'palmeira_areca' ? 4 : 1;
    for (let st = 0; st < stemCount; st++) {
      const stemH =
        (speciesId === 'palmeira_imperial' ? 5.2 : speciesId === 'coqueiro_anao' ? 3.9 : 2.1 + (st % 2) * 0.45) * s;
      const rBot = (speciesId === 'palmeira_imperial' ? 0.19 : speciesId === 'coqueiro_anao' ? 0.14 : 0.048) * s;
      const rTop = rBot * 0.72;
      const offX = stemCount > 1 ? Math.cos((st * Math.PI * 2) / stemCount) * 0.16 * s : 0;
      const offZ = stemCount > 1 ? Math.sin((st * Math.PI * 2) / stemCount) * 0.16 * s : 0;

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, stemH, 10), barkMat);
      trunk.position.set(offX, stemH / 2, offZ);
      if (speciesId === 'coqueiro_anao') trunk.rotation.z = 0.07;
      if (stemCount > 1) {
        trunk.rotation.z = -offX * 0.35;
        trunk.rotation.x = offZ * 0.35;
      }
      trunk.castShadow = castShadow;
      trunk.receiveShadow = true;
      group.add(trunk);

      const crownY = stemH * 0.96;
      const crownX = offX + (speciesId === 'coqueiro_anao' ? -stemH * 0.065 : 0);

      if (speciesId === 'palmeira_imperial') {
        const crownshaft = new THREE.Mesh(
          new THREE.CylinderGeometry(rTop * 0.92, rTop * 1.04, 0.75 * s, 10),
          new THREE.MeshStandardMaterial({ color: '#397E3C', roughness: 0.45 }),
        );
        crownshaft.position.set(crownX, crownY - 0.15 * s, offZ);
        group.add(crownshaft);
      }

      // Coconut cluster under crown
      if (speciesId === 'coqueiro_anao') {
        const cocoMat = new THREE.MeshStandardMaterial({ color: '#619A30', roughness: 0.45 });
        for (let c = 0; c < 5; c++) {
          const coco = new THREE.Mesh(new THREE.SphereGeometry(0.1 * s, 8, 8), cocoMat);
          const ang = (c * Math.PI * 2) / 5;
          coco.position.set(crownX + Math.cos(ang) * 0.18 * s, crownY - 0.12 * s, offZ + Math.sin(ang) * 0.18 * s);
          group.add(coco);
        }
      }

      const fronds = speciesId === 'palmeira_areca' ? 6 : 11;
      const frondLen = (speciesId === 'palmeira_imperial' ? 2.1 : speciesId === 'coqueiro_anao' ? 1.85 : 1.05) * s;
      const frondW = frondLen * 0.55;
      for (let f = 0; f < fronds; f++) {
        const yaw = (f / fronds) * Math.PI * 2 + st * 0.4;
        const tier = f % 2 === 0 ? 0.52 : 0.88;
        const cardGeo = new THREE.PlaneGeometry(frondW, frondLen, 1, 3);
        // Arch the frond downward naturally along length
        const pos = cardGeo.attributes.position;
        for (let vi = 0; vi < pos.count; vi++) {
          const py = pos.getY(vi) + frondLen / 2; // 0..frondLen
          const frac = py / frondLen;
          pos.setY(vi, py);
          pos.setZ(vi, -Math.pow(frac, 1.8) * frondLen * 0.36);
        }
        cardGeo.computeVertexNormals();
        const frond = new THREE.Mesh(cardGeo, frondMat);
        const pivot = new THREE.Group();
        pivot.position.set(crownX, crownY, offZ);
        pivot.rotation.y = yaw;
        frond.rotation.x = tier;
        frond.castShadow = castShadow;
        pivot.add(frond);
        group.add(pivot);
      }
    }
    return group;
  }

  // 2. Banana Plant (broad arched tropical leaves)
  if (speciesId === 'bananeira') {
    const h = 1.65 * s;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.14 * s, h, 8), barkMat);
    stem.position.y = h / 2;
    stem.castShadow = castShadow;
    group.add(stem);

    const leafMat = new THREE.MeshStandardMaterial({
      color: meta.foliageHex,
      roughness: 0.48,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 8; i++) {
      const leafGeo = new THREE.PlaneGeometry(0.48 * s, 1.35 * s, 1, 4);
      const pos = leafGeo.attributes.position;
      for (let vi = 0; vi < pos.count; vi++) {
        const py = pos.getY(vi) + 0.675 * s;
        const frac = py / (1.35 * s);
        pos.setY(vi, py);
        pos.setZ(vi, -Math.pow(frac, 1.6) * 0.45 * s);
      }
      leafGeo.computeVertexNormals();
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const piv = new THREE.Group();
      piv.position.y = h * (0.78 + (i % 3) * 0.08);
      piv.rotation.y = (i / 8) * Math.PI * 2;
      leaf.rotation.x = 0.62 + (i % 2) * 0.25;
      leaf.castShadow = castShadow;
      piv.add(leaf);
      group.add(piv);
    }
    // Banana bunch accent
    const bunch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * s, 0.09 * s, 0.35 * s, 8),
      new THREE.MeshStandardMaterial({ color: meta.accentHex, roughness: 0.55 }),
    );
    bunch.position.set(0.18 * s, h * 0.72, 0.1 * s);
    group.add(bunch);
    return group;
  }

  // 3. Monstera / Heliconia / Moreia / Buxinho / Podocarpus shrubs & border plants
  if (
    speciesId === 'costela_de_adao' ||
    speciesId === 'heliconia' ||
    speciesId === 'moreia' ||
    speciesId === 'buxinho' ||
    speciesId === 'podocarpus'
  ) {
    if (speciesId === 'buxinho') {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.06 * s, 0.22 * s, 6), barkMat);
      pot.position.y = 0.11 * s;
      group.add(pot);
      const foliTex = makeCanopyFoliageTexture(meta.foliageHex, meta.secondaryFoliageHex);
      const hedgeMat = new THREE.MeshStandardMaterial({
        map: foliTex,
        color: meta.foliageHex,
        roughness: 0.75,
      });
      const r = 0.38 * s;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), hedgeMat);
      dome.scale.set(1, 0.92, 1);
      dome.position.y = r + 0.14 * s;
      dome.castShadow = castShadow;
      group.add(dome);
      return group;
    }

    if (speciesId === 'podocarpus') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.6 * s, 6), barkMat);
      trunk.position.y = 0.3 * s;
      group.add(trunk);
      const tex = makeCanopyFoliageTexture(meta.foliageHex, meta.secondaryFoliageHex);
      const cardMat = new THREE.MeshStandardMaterial({
        map: tex,
        alphaTest: 0.32,
        side: THREE.DoubleSide,
        roughness: 0.68,
      });
      for (let tier = 0; tier < 3; tier++) {
        for (let a = 0; a < 3; a++) {
          const card = new THREE.Mesh(new THREE.PlaneGeometry(0.75 * s, 1.15 * s), cardMat);
          card.position.y = (0.85 + tier * 0.65) * s;
          card.rotation.y = (a * Math.PI) / 3 + tier * 0.4;
          card.castShadow = castShadow;
          group.add(card);
        }
      }
      return group;
    }

    if (speciesId === 'costela_de_adao') {
      const mTex = makeCanopyFoliageTexture(meta.foliageHex, meta.secondaryFoliageHex, undefined, true);
      const mMat = new THREE.MeshStandardMaterial({
        map: mTex,
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        roughness: 0.42,
      });
      const stemMat = new THREE.MeshStandardMaterial({ color: meta.trunkHex, roughness: 0.7 });
      for (let i = 0; i < 7; i++) {
        const yaw = (i / 7) * Math.PI * 2;
        const len = (0.55 + (i % 3) * 0.16) * s;
        const petiole = new THREE.Mesh(new THREE.CylinderGeometry(0.015 * s, 0.022 * s, len, 5), stemMat);
        petiole.position.set(Math.cos(yaw) * 0.18 * s, len * 0.45, Math.sin(yaw) * 0.18 * s);
        petiole.rotation.z = -Math.cos(yaw) * 0.48;
        petiole.rotation.x = Math.sin(yaw) * 0.48;
        group.add(petiole);

        const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.55 * s, 0.62 * s), mMat);
        blade.position.set(Math.cos(yaw) * 0.34 * s, len * 0.85, Math.sin(yaw) * 0.34 * s);
        blade.rotation.set(-0.75, yaw, 0);
        blade.castShadow = castShadow;
        group.add(blade);
      }
      return group;
    }

    // Heliconia or Moreia linear fans + flowers
    const bladeCount = speciesId === 'heliconia' ? 8 : 14;
    const h = (speciesId === 'heliconia' ? 1.45 : 0.62) * s;
    const w = (speciesId === 'heliconia' ? 0.24 : 0.07) * s;
    const leafMat = new THREE.MeshStandardMaterial({
      color: meta.foliageHex,
      roughness: 0.48,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < bladeCount; i++) {
      const yaw = (i / bladeCount) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(w, h), leafMat);
      blade.position.set(Math.cos(yaw) * 0.12 * s, h * 0.46, Math.sin(yaw) * 0.12 * s);
      blade.rotation.y = yaw;
      blade.rotation.x = 0.22 + (i % 3) * 0.12;
      blade.castShadow = castShadow;
      group.add(blade);
    }
    const accentMat = new THREE.MeshStandardMaterial({ color: meta.accentHex, roughness: 0.4 });
    for (let f = 0; f < 3; f++) {
      const fl = new THREE.Mesh(new THREE.OctahedronGeometry((speciesId === 'heliconia' ? 0.08 : 0.045) * s, 0), accentMat);
      fl.position.set(Math.cos(f * 2.1) * 0.18 * s, h * 0.86, Math.sin(f * 2.1) * 0.18 * s);
      group.add(fl);
    }
    return group;
  }

  // 4. Broadleaf & Fruit / Flowering Trees (Jabuticabeira, Mangueira, Limoeiro, Pitangueira, Aceroleira, Ipe, Pata de Vaca, Bougainvillea)
  const treeScaleH = (meta.matureHeightM / 4.2) * s;
  const trunkH = 1.35 * treeScaleH;
  const trunkR = (speciesId === 'bougainvillea' ? 0.07 : 0.12) * s;

  const mainTrunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.72, trunkR * 1.15, trunkH, 9), barkMat);
  mainTrunk.position.y = trunkH / 2;
  mainTrunk.castShadow = castShadow;
  mainTrunk.receiveShadow = true;
  group.add(mainTrunk);

  // Forked primary limbs
  const limbMat = barkMat;
  for (let b = 0; b < 3; b++) {
    const yaw = (b * Math.PI * 2) / 3 + 0.3;
    const limbLen = 0.85 * treeScaleH;
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.35, trunkR * 0.65, limbLen, 6), limbMat);
    limb.position.set(
      Math.cos(yaw) * limbLen * 0.26,
      trunkH * 0.88 + limbLen * 0.35,
      Math.sin(yaw) * limbLen * 0.26,
    );
    limb.rotation.z = -Math.cos(yaw) * 0.55;
    limb.rotation.x = Math.sin(yaw) * 0.55;
    limb.castShadow = castShadow;
    group.add(limb);
  }

  // Jabuticabeira cauliflory fruits directly on trunk & limbs!
  if (speciesId === 'jabuticabeira') {
    const berryMat = new THREE.MeshStandardMaterial({ color: meta.accentHex, roughness: 0.3, metalness: 0.1 });
    for (let jb = 0; jb < 14; jb++) {
      const a = jb * 1.7;
      const y = trunkH * (0.35 + (jb % 5) * 0.13);
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.025 * s, 6, 6), berryMat);
      berry.position.set(Math.cos(a) * trunkR * 0.98, y, Math.sin(a) * trunkR * 0.98);
      group.add(berry);
    }
  }

  // Alpha-cutout crossed foliage crown cards + blossom/fruit accent clusters
  const showBlossomsOnCanopy =
    speciesId === 'ipe_amarelo' ||
    speciesId === 'pata_de_vaca' ||
    speciesId === 'bougainvillea' ||
    speciesId === 'aceroleira' ||
    speciesId === 'pitangueira' ||
    speciesId === 'limoeiro' ||
    speciesId === 'mangueira';

  const crownTex = makeCanopyFoliageTexture(
    meta.foliageHex,
    meta.secondaryFoliageHex,
    showBlossomsOnCanopy ? meta.accentHex : undefined,
    false,
  );
  const crownMat = new THREE.MeshStandardMaterial({
    map: crownTex,
    alphaTest: 0.32,
    side: THREE.DoubleSide,
    roughness: 0.68,
    metalness: 0.02,
  });

  const canopyDia = Math.max(1.3, meta.canopyDiameterM * 0.72) * s;
  const canopyCenterY = trunkH + canopyDia * 0.36;
  const cardOffsets = [
    { x: 0, y: canopyCenterY, z: 0, sc: 1.0 },
    { x: canopyDia * 0.22, y: canopyCenterY + 0.14 * s, z: canopyDia * 0.12, sc: 0.76 },
    { x: -canopyDia * 0.22, y: canopyCenterY + 0.08 * s, z: -canopyDia * 0.14, sc: 0.78 },
    { x: 0.06 * s, y: canopyCenterY + canopyDia * 0.26, z: 0.06 * s, sc: 0.72 },
  ];

  for (const co of cardOffsets) {
    const sub = new THREE.Group();
    sub.position.set(co.x, co.y, co.z);
    const sz = canopyDia * co.sc;
    for (let r = 0; r < 3; r++) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), crownMat);
      plane.rotation.y = (r * Math.PI) / 3;
      plane.rotation.x = r === 2 ? Math.PI / 3.2 : 0.18;
      plane.castShadow = castShadow;
      sub.add(plane);
    }
    group.add(sub);
  }

  return group;
}

/**
 * Builds a complete multi-part 3D Swimming Pool (recessed tile basin, stone/wood coping,
 * sun shelf / prainha, animated water surface with normal/bump, waterfall & LED spots).
 */
export function buildPool3D(
  pool: PoolSpec,
  groundY: number,
  nightOn: boolean,
  isSoftwareGl: boolean,
  maxAniso = 4,
): { group: THREE.Group; waterMat: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial } {
  const group = new THREE.Group();
  const cx = pool.x + pool.width / 2;
  const cz = pool.y + pool.depth / 2;
  group.position.set(cx, groundY, cz);

  const copingColor =
    pool.copingMaterial === 'deck_madeira'
      ? '#8E5830'
      : pool.copingMaterial === 'porcelanato_antiderrapante'
        ? '#D6D2CA'
        : '#E8E0CE';
  const copingMat = new THREE.MeshStandardMaterial({
    color: copingColor,
    roughness: 0.68,
    metalness: 0.03,
  });

  const rimW = 0.28;
  const rimH = 0.09;
  const basinH = Math.min(0.65, pool.waterDepthM * 0.45);
  const w = pool.width;
  const d = pool.depth;

  // Raised coping border around water
  const topBorder = new THREE.Mesh(new THREE.BoxGeometry(w + rimW * 2, rimH, rimW), copingMat);
  topBorder.position.set(0, rimH / 2, -(d / 2 + rimW / 2));
  const botBorder = new THREE.Mesh(new THREE.BoxGeometry(w + rimW * 2, rimH, rimW), copingMat);
  botBorder.position.set(0, rimH / 2, d / 2 + rimW / 2);
  const leftBorder = new THREE.Mesh(new THREE.BoxGeometry(rimW, rimH, d), copingMat);
  leftBorder.position.set(-(w / 2 + rimW / 2), rimH / 2, 0);
  const rightBorder = new THREE.Mesh(new THREE.BoxGeometry(rimW, rimH, d), copingMat);
  rightBorder.position.set(w / 2 + rimW / 2, rimH / 2, 0);

  [topBorder, botBorder, leftBorder, rightBorder].forEach((m) => {
    m.receiveShadow = true;
    m.castShadow = !isSoftwareGl;
    group.add(m);
  });

  // Tiled interior basin floor & walls
  const tileTex = createPoolTileTexture(pool.linerColor, maxAniso);
  const tileMat = new THREE.MeshStandardMaterial({
    map: tileTex,
    roughness: 0.22,
    metalness: 0.08,
  });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), tileMat);
  floor.position.set(0, -basinH * 0.2 + 0.02, 0);
  floor.receiveShadow = true;
  group.add(floor);

  // Side tile lining collar inside rim
  const innerRimH = 0.14;
  const innerN = new THREE.Mesh(new THREE.BoxGeometry(w, innerRimH, 0.04), tileMat);
  innerN.position.set(0, 0.01, -d / 2 + 0.02);
  const innerS = new THREE.Mesh(new THREE.BoxGeometry(w, innerRimH, 0.04), tileMat);
  innerS.position.set(0, 0.01, d / 2 - 0.02);
  const innerW = new THREE.Mesh(new THREE.BoxGeometry(0.04, innerRimH, d), tileMat);
  innerW.position.set(-w / 2 + 0.02, 0.01, 0);
  const innerE = new THREE.Mesh(new THREE.BoxGeometry(0.04, innerRimH, d), tileMat);
  innerE.position.set(w / 2 - 0.02, 0.01, 0);
  group.add(innerN, innerS, innerW, innerE);

  // Shallow Prainha ledge if style === 'com_prainha'
  if (pool.style === 'com_prainha') {
    const ledgeW = Math.min(1.0, w * 0.28);
    const prainha = new THREE.Mesh(new THREE.BoxGeometry(ledgeW, 0.05, d - 0.08), tileMat);
    prainha.position.set(-w / 2 + ledgeW / 2 + 0.02, -0.02, 0);
    group.add(prainha);
  }

  // Animated specular water plane
  const waterBump = createWaterRippleBumpTexture(maxAniso);
  const waterColor =
    pool.linerColor === 'turquesa_hijau'
      ? '#26B5AC'
      : pool.linerColor === 'ardosia'
        ? '#2B5B78'
        : '#1E90D8';
  const waterMat = isSoftwareGl
    ? new THREE.MeshStandardMaterial({
        color: waterColor,
        bumpMap: waterBump,
        bumpScale: 0.022,
        roughness: 0.08,
        metalness: 0.22,
        transparent: true,
        opacity: 0.78,
      })
    : new THREE.MeshPhysicalMaterial({
        color: waterColor,
        bumpMap: waterBump,
        bumpScale: 0.025,
        roughness: 0.06,
        metalness: 0.08,
        ior: 1.333,
        reflectivity: 0.9,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        transparent: true,
        opacity: 0.76,
      });

  const water = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, d - 0.04), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.055;
  water.receiveShadow = true;
  group.add(water);

  // Optional brushed stainless waterfall blade
  if (pool.hasWaterfall) {
    const steelMat = new THREE.MeshStandardMaterial({
      color: '#D4DBE3',
      metalness: 0.88,
      roughness: 0.2,
    });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, 0.42), steelMat);
    stand.position.set(w / 2 + 0.08, 0.28, 0);
    const spout = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.42), steelMat);
    spout.position.set(w / 2 - 0.04, 0.54, 0);
    const cascade = new THREE.Mesh(
      new THREE.PlaneGeometry(0.38, 0.5),
      new THREE.MeshStandardMaterial({
        color: '#9BE7FF',
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        emissive: '#38BDF8',
        emissiveIntensity: nightOn ? 0.45 : 0.12,
      }),
    );
    cascade.position.set(w / 2 - 0.2, 0.29, 0);
    cascade.rotation.y = Math.PI / 2;
    group.add(stand, spout, cascade);
  }

  // Underwater Cyan LEDs
  if (pool.hasLedLights) {
    const ledMat = new THREE.MeshStandardMaterial({
      color: '#67E8F9',
      emissive: '#06B6D4',
      emissiveIntensity: nightOn ? 2.4 : 0.35,
    });
    const positions = [-w * 0.25, w * 0.25];
    for (const lx of positions) {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), ledMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(lx, 0.02, -d / 2 + 0.04);
      group.add(lens);
      if (nightOn) {
        const pl = new THREE.PointLight('#22D3EE', 1.6, 4.2, 2);
        pl.position.set(lx, 0.18, 0);
        group.add(pl);
      }
    }
  }

  return { group, waterMat };
}

/**
 * Builds a multi-part 3D Gourmet Leisure Area (cumaru timber or black steel pergola,
 * masonry churrasqueira + flue + grill embers, granite counter/sink, and dining set).
 */
export function buildGourmetArea3D(
  gourmet: GourmetAreaSpec,
  groundY: number,
  nightOn: boolean,
  isSoftwareGl: boolean,
): THREE.Group {
  const group = new THREE.Group();
  const cx = gourmet.x + gourmet.width / 2;
  const cz = gourmet.y + gourmet.depth / 2;
  group.position.set(cx, groundY, cz);

  const w = gourmet.width;
  const d = gourmet.depth;
  const castShadow = !isSoftwareGl;

  // Pergola
  if (gourmet.hasPergola) {
    const pergH = 2.65;
    const beamMat = new THREE.MeshStandardMaterial({
      color: gourmet.pergolaMaterial === 'aco_preto' ? '#1E232B' : '#8A522C',
      roughness: gourmet.pergolaMaterial === 'aco_preto' ? 0.38 : 0.72,
      metalness: gourmet.pergolaMaterial === 'aco_preto' ? 0.78 : 0.04,
    });
    const postOffsets = [
      [-w / 2 + 0.1, -d / 2 + 0.1],
      [w / 2 - 0.1, -d / 2 + 0.1],
      [-w / 2 + 0.1, d / 2 - 0.1],
      [w / 2 - 0.1, d / 2 - 0.1],
    ];
    for (const [px, pz] of postOffsets) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, pergH, 0.12), beamMat);
      post.position.set(px, pergH / 2, pz);
      post.castShadow = castShadow;
      group.add(post);
    }
    // Perimeter beams
    const beamF = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 0.12), beamMat);
    beamF.position.set(0, pergH - 0.08, d / 2 - 0.1);
    const beamB = beamF.clone();
    beamB.position.z = -d / 2 + 0.1;
    group.add(beamF, beamB);

    const rafterCount = Math.max(4, Math.floor(w / 0.32));
    for (let i = 0; i < rafterCount; i++) {
      const rx = -w / 2 + 0.16 + (i / Math.max(1, rafterCount - 1)) * (w - 0.32);
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, d), beamMat);
      rafter.position.set(rx, pergH + 0.04, 0);
      rafter.castShadow = castShadow;
      group.add(rafter);
    }
  }

  // Churrasqueira + Chimney against back edge
  if (gourmet.hasChurrasqueira) {
    const brickMat = new THREE.MeshStandardMaterial({ color: '#9C4D36', roughness: 0.85 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#2F343B', roughness: 0.35 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 0.65), brickMat);
    base.position.set(-w * 0.25, 0.45, -d / 2 + 0.42);
    base.castShadow = castShadow;
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.42, 0.85, 4), brickMat);
    hood.rotation.y = Math.PI / 4;
    hood.position.set(-w * 0.25, 1.72, -d / 2 + 0.42);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.95, 0.26), brickMat);
    chimney.position.set(-w * 0.25, 2.55, -d / 2 + 0.42);
    const firebox = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.38, 0.06), stoneMat);
    firebox.position.set(-w * 0.25, 1.05, -d / 2 + 0.72);
    const embers = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.05, 0.28),
      new THREE.MeshStandardMaterial({
        color: '#D93814',
        emissive: '#FF5E1A',
        emissiveIntensity: nightOn ? 1.8 : 0.4,
      }),
    );
    embers.position.set(-w * 0.25, 0.92, -d / 2 + 0.48);
    group.add(base, hood, chimney, firebox, embers);
  }

  // Granite counter & sink next to churrasqueira
  if (gourmet.hasCounterSink) {
    const baseMat = new THREE.MeshStandardMaterial({ color: '#E5E7EB', roughness: 0.7 });
    const graniteMat = new THREE.MeshStandardMaterial({ color: '#252930', roughness: 0.28, metalness: 0.1 });
    const cw = Math.min(1.4, w * 0.45);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.84, 0.6), baseMat);
    cab.position.set(w * 0.22, 0.42, -d / 2 + 0.42);
    const top = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.04, 0.05, 0.64), graniteMat);
    top.position.set(w * 0.22, 0.865, -d / 2 + 0.42);
    const faucet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: '#D1D5DB', metalness: 0.85, roughness: 0.2 }),
    );
    faucet.position.set(w * 0.22, 0.99, -d / 2 + 0.22);
    group.add(cab, top, faucet);
  }

  // Outdoor dining table + stools
  if (gourmet.hasDiningSet) {
    const woodMat = new THREE.MeshStandardMaterial({ color: '#9C643B', roughness: 0.62 });
    const ironMat = new THREE.MeshStandardMaterial({ color: '#1F242C', metalness: 0.6, roughness: 0.4 });
    const tw = Math.min(1.45, w * 0.48);
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.05, 0.78), woodMat);
    tableTop.position.set(0, 0.75, 0.28);
    tableTop.castShadow = castShadow;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.68), ironMat);
    legL.position.set(-tw * 0.4, 0.37, 0.28);
    const legR = legL.clone();
    legR.position.x = tw * 0.4;
    group.add(tableTop, legL, legR);

    for (const sx of [-tw * 0.26, tw * 0.26]) {
      for (const sz of [-0.22, 0.78]) {
        const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.46, 10), woodMat);
        stool.position.set(sx, 0.23, sz);
        group.add(stool);
      }
    }
  }

  if (nightOn) {
    const warmLight = new THREE.PointLight('#FDBA74', 2.4, 7, 2);
    warmLight.position.set(0, 2.35, 0);
    group.add(warmLight);
  }

  return group;
}

/**
 * Builds an authentic 3D roof over the building footprint supporting all 4 architectural roof shapes:
 * `platibanda`, `duas_aguas`, `uma_agua`, `laje_plana`.
 */
export function buildRoofGeometryGroup(params: {
  x: number;
  y: number;
  width: number;
  depth: number;
  baseElevationY: number;
  roofShape: RoofShapeType;
  roofFinish: RoofFinishMaterial;
  slopePercent: number;
  facadeMat: THREE.Material;
  roofMat: THREE.Material;
  isSoftwareGl: boolean;
}): THREE.Group {
  const { x, y, width, depth, baseElevationY, roofShape, slopePercent, facadeMat, roofMat, isSoftwareGl } = params;
  const g = new THREE.Group();
  const cx = x + width / 2;
  const cz = y + depth / 2;
  const castShadow = !isSoftwareGl;
  const rise = Math.max(0.45, Math.min(2.2, (Math.min(width, depth) * Math.max(8, slopePercent)) / 100));

  if (roofShape === 'platibanda' || roofShape === 'laje_plana') {
    const parapetH = roofShape === 'platibanda' ? 0.58 : 0.22;
    const t = 0.15;
    const pN = new THREE.Mesh(new THREE.BoxGeometry(width, parapetH, t), facadeMat);
    pN.position.set(cx, baseElevationY + parapetH / 2, y + t / 2);
    const pS = new THREE.Mesh(new THREE.BoxGeometry(width, parapetH, t), facadeMat);
    pS.position.set(cx, baseElevationY + parapetH / 2, y + depth - t / 2);
    const pW = new THREE.Mesh(new THREE.BoxGeometry(t, parapetH, depth), facadeMat);
    pW.position.set(x + t / 2, baseElevationY + parapetH / 2, cz);
    const pE = new THREE.Mesh(new THREE.BoxGeometry(t, parapetH, depth), facadeMat);
    pE.position.set(x + width - t / 2, baseElevationY + parapetH / 2, cz);

    const roofDeck = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.4, width - 0.12), 0.1, Math.max(0.4, depth - 0.12)),
      roofMat,
    );
    roofDeck.position.set(cx, baseElevationY + (roofShape === 'platibanda' ? 0.14 : 0.08), cz);
    roofDeck.receiveShadow = true;

    [pN, pS, pW, pE, roofDeck].forEach((m) => {
      m.castShadow = castShadow;
      m.receiveShadow = true;
      g.add(m);
    });
    return g;
  }

  const overhang = 0.35;
  const rw = width + overhang * 2;
  const rd = depth + overhang * 2;
  const pitchAlongX = width <= depth; // ridge along longer axis

  if (roofShape === 'duas_aguas') {
    const span = pitchAlongX ? rw : rd;
    const runLen = pitchAlongX ? rd : rw;
    const halfSpan = span / 2;
    const slopeLen = Math.hypot(halfSpan, rise);
    const angle = Math.atan2(rise, halfSpan);

    // Build gable triangular end walls on building footprint (without overhang)
    const wallSpan = pitchAlongX ? width : depth;
    const shape = new THREE.Shape();
    shape.moveTo(-wallSpan / 2, 0);
    shape.lineTo(wallSpan / 2, 0);
    shape.lineTo(0, rise * (wallSpan / span));
    shape.closePath();

    const gableGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false });
    const g1 = new THREE.Mesh(gableGeo, facadeMat);
    const g2 = new THREE.Mesh(gableGeo, facadeMat);
    if (pitchAlongX) {
      g1.position.set(cx, baseElevationY, y);
      g2.position.set(cx, baseElevationY, y + depth - 0.15);
    } else {
      g1.rotation.y = Math.PI / 2;
      g1.position.set(x, baseElevationY, cz);
      g2.rotation.y = Math.PI / 2;
      g2.position.set(x + width - 0.15, baseElevationY, cz);
    }
    g.add(g1, g2);

    // Two pitched roof planes
    for (const side of [-1, 1]) {
      const panelGeo = pitchAlongX
        ? new THREE.BoxGeometry(slopeLen, 0.08, runLen)
        : new THREE.BoxGeometry(runLen, 0.08, slopeLen);
      const panel = new THREE.Mesh(panelGeo, roofMat);
      if (pitchAlongX) {
        panel.position.set(cx + (side * halfSpan) / 2, baseElevationY + rise / 2, cz);
        panel.rotation.z = -side * angle;
      } else {
        panel.position.set(cx, baseElevationY + rise / 2, cz + (side * halfSpan) / 2);
        panel.rotation.x = side * angle;
      }
      panel.castShadow = castShadow;
      panel.receiveShadow = true;
      g.add(panel);
    }

    // Ridge cap
    const ridge = new THREE.Mesh(
      pitchAlongX
        ? new THREE.BoxGeometry(0.18, 0.09, runLen + 0.04)
        : new THREE.BoxGeometry(runLen + 0.04, 0.09, 0.18),
      roofMat,
    );
    ridge.position.set(cx, baseElevationY + rise + 0.03, cz);
    g.add(ridge);
    return g;
  }

  // 'uma_agua' monopitch roof sloping downward toward +Z (street/front)
  const slopeLen = Math.hypot(rd, rise);
  const angle = Math.atan2(rise, rd);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.09, slopeLen), roofMat);
  panel.position.set(cx, baseElevationY + rise / 2, cz);
  panel.rotation.x = angle;
  panel.castShadow = castShadow;
  panel.receiveShadow = true;
  g.add(panel);

  // Tapered side parapet triangles closing sides of monopitch
  const wallRise = rise * (depth / rd);
  const sideShape = new THREE.Shape();
  sideShape.moveTo(0, 0);
  sideShape.lineTo(depth, 0);
  sideShape.lineTo(depth, wallRise);
  sideShape.closePath();
  const sideGeo = new THREE.ExtrudeGeometry(sideShape, { depth: 0.15, bevelEnabled: false });
  const sL = new THREE.Mesh(sideGeo, facadeMat);
  sL.rotation.y = Math.PI / 2;
  sL.position.set(x, baseElevationY, y + depth);
  const sR = new THREE.Mesh(sideGeo, facadeMat);
  sR.rotation.y = Math.PI / 2;
  sR.position.set(x + width - 0.15, baseElevationY, y + depth);

  // Rear high wall closing the tall edge of monopitch
  const backClose = new THREE.Mesh(
    new THREE.BoxGeometry(width, Math.max(0.25, wallRise), 0.15),
    facadeMat,
  );
  backClose.position.set(cx, baseElevationY + wallRise / 2, y + 0.075);
  backClose.castShadow = castShadow;
  backClose.receiveShadow = true;
  g.add(sL, sR, backClose);

  return g;
}

/**
 * Conjunto completo de Cobertura Superior:
 * 1. Laje de Cobertura estrutural fechando o teto do último pavimento sobre as paredes
 * 2. Castelo da Caixa d'Água (Reservatório Superior) apoiado sobre a Laje de Cobertura
 * 3. Telhado fechado (Platibanda / Duas Águas / Uma Água / Laje Plana) acima da Laje
 */
export function buildRoofAndWaterTowerGroup(params: {
  x: number;
  y: number;
  width: number;
  depth: number;
  baseElevationY: number;
  roofShape: RoofShapeType;
  roofFinish: RoofFinishMaterial;
  slopePercent: number;
  facadeMat: THREE.Material;
  slabMat: THREE.Material;
  roofMat: THREE.Material;
  tankMat: THREE.Material;
  pipeMat: THREE.Material;
  isSoftwareGl: boolean;
  showRoofShell?: boolean;
  reservoirLiters?: number;
}): THREE.Group {
  const {
    x,
    y,
    width,
    depth,
    baseElevationY,
    roofShape,
    roofFinish,
    slopePercent,
    facadeMat,
    slabMat,
    roofMat,
    tankMat,
    pipeMat,
    isSoftwareGl,
    showRoofShell = true,
    reservoirLiters = 1000,
  } = params;
  const g = new THREE.Group();
  const cx = x + width / 2;
  const cz = y + depth / 2;
  const castShadow = !isSoftwareGl;

  // 1. Laje de Cobertura fechando 100% do teto sobre as paredes externas
  const roofSlabH = 0.14;
  const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(width, roofSlabH, depth), slabMat);
  roofSlab.position.set(cx, baseElevationY + roofSlabH / 2, cz);
  roofSlab.castShadow = castShadow;
  roofSlab.receiveShadow = true;
  roofSlab.userData = {
    bimLabel: 'Laje de Cobertura Superior',
    bimDiscipline: 'Estrutura Conceitual',
    bimDetail: `Laje maciça ${width.toFixed(2)}×${depth.toFixed(2)}m (e=14 cm) fechando o teto`,
  };
  g.add(roofSlab);

  const lajeTopY = baseElevationY + roofSlabH;

  // 2. Castelo da Caixa d'Água (Reservatório Superior apoiado sobre a Laje de Cobertura)
  const towerW = Math.min(1.45, Math.max(1.05, width * 0.34));
  const towerD = Math.min(1.45, Math.max(1.05, depth * 0.22));
  const towerH = 1.15;
  const towerX = x + Math.min(Math.max(0.2, width * 0.18), width - towerW - 0.2);
  const towerZ = y + Math.min(Math.max(0.2, depth * 0.16), depth - towerD - 0.2);
  const tCx = towerX + towerW / 2;
  const tCz = towerZ + towerD / 2;

  const casteloUserData = {
    bimLabel: `Castelo da Caixa d'Água Superior (${reservoirLiters} L)`,
    bimDiscipline: 'Hidráulica',
    bimDetail: `Apoiado sobre a Laje de Cobertura · ${towerW.toFixed(2)}×${towerD.toFixed(2)}×${towerH.toFixed(2)}m`,
  };

  // Base de apoio em concreto sobre a laje
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(towerW, 0.1, towerD), slabMat);
  pedestal.position.set(tCx, lajeTopY + 0.05, tCz);
  pedestal.castShadow = castShadow;
  pedestal.receiveShadow = true;
  pedestal.userData = casteloUserData;
  g.add(pedestal);

  // Paredes do castelo técnico em alvenaria externa
  const wt = 0.11;
  const tN = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, wt), facadeMat);
  tN.position.set(tCx, lajeTopY + towerH / 2, towerZ + wt / 2);
  const tS = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, wt), facadeMat);
  tS.position.set(tCx, lajeTopY + towerH / 2, towerZ + towerD - wt / 2);
  const tW = new THREE.Mesh(new THREE.BoxGeometry(wt, towerH, towerD), facadeMat);
  tW.position.set(towerX + wt / 2, lajeTopY + towerH / 2, tCz);
  const tE = new THREE.Mesh(new THREE.BoxGeometry(wt, towerH, towerD), facadeMat);
  tE.position.set(towerX + towerW - wt / 2, lajeTopY + towerH / 2, tCz);
  for (const m of [tN, tS, tW, tE]) {
    m.castShadow = castShadow;
    m.receiveShadow = true;
    m.userData = casteloUserData;
    g.add(m);
  }

  // Caixa d'água polietileno azul instalada dentro do castelo, sobre a laje
  const tankR = Math.min(towerW, towerD) * 0.34;
  const tankBody = new THREE.Mesh(new THREE.CylinderGeometry(tankR, tankR * 0.84, 0.72, 18), tankMat);
  tankBody.position.set(tCx, lajeTopY + 0.1 + 0.36, tCz);
  tankBody.userData = casteloUserData;
  const tankLid = new THREE.Mesh(new THREE.CylinderGeometry(tankR * 1.04, tankR * 1.04, 0.06, 18), tankMat);
  tankLid.position.set(tCx, lajeTopY + 0.1 + 0.74, tCz);
  tankLid.userData = casteloUserData;
  const colPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), pipeMat);
  colPipe.position.set(tCx + tankR * 0.65, lajeTopY + 0.25, tCz);
  g.add(tankBody, tankLid, colPipe);

  // Tampa / cobertura própria do Castelo d'Água (visível quando telhado está fechado ou aberto)
  const capH = 0.08;
  const towerCap = new THREE.Mesh(
    new THREE.BoxGeometry(towerW + 0.14, capH, towerD + 0.14),
    showRoofShell ? roofMat : tankMat,
  );
  towerCap.position.set(tCx, lajeTopY + towerH + capH / 2, tCz);
  towerCap.castShadow = castShadow;
  towerCap.receiveShadow = true;
  towerCap.userData = casteloUserData;
  if (showRoofShell) {
    g.add(towerCap);
  }

  // 3. Telhado Fechado acima da Laje de Cobertura
  if (showRoofShell) {
    const roofGroup = buildRoofGeometryGroup({
      x,
      y,
      width,
      depth,
      baseElevationY: lajeTopY,
      roofShape,
      roofFinish,
      slopePercent,
      facadeMat,
      roofMat,
      isSoftwareGl,
    });
    g.add(roofGroup);
  }

  return g;
}

