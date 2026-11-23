import * as THREE from 'three';
import type {
  ExteriorSurfaceType,
  FloorFinishMaterial,
  PoolSpec,
  RoofFinishMaterial,
  WallExteriorFinish,
  WallInteriorFinish,
} from '../types/project';

export interface ProceduralTextureSet {
  map: THREE.CanvasTexture;
  bumpMap?: THREE.CanvasTexture;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function seededRand(seedInit: number): () => number {
  let seed = seedInit;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function wrapTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  isColor: boolean,
  maxAniso: number,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAniso;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates exterior wall cladding PBR textures (acrylic texture, smooth plaster, brick, stone, wood slats, burnt cement).
 */
export function createWallExteriorTextures(
  finish: WallExteriorFinish,
  baseHex: string,
  maxAniso = 4,
): ProceduralTextureSet {
  const size = 512;
  const [cColor, ctxColor] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);
  const rand = seededRand(2026);

  if (finish === 'tijolinho_aparente') {
    ctxColor.fillStyle = '#B8AFA5'; // mortar joint
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#404040';
    ctxBump.fillRect(0, 0, size, size);

    const rows = 12;
    const cols = 5;
    const rh = size / rows;
    const cw = size / cols;
    for (let r = 0; r < rows; r++) {
      const offset = r % 2 === 0 ? 0 : cw / 2;
      for (let c = -1; c <= cols; c++) {
        const bx = c * cw + offset + 3;
        const by = r * rh + 3;
        const shift = Math.floor((rand() - 0.5) * 28);
        ctxColor.fillStyle = `rgb(${158 + shift}, ${82 + Math.floor(shift * 0.6)}, ${58 + Math.floor(shift * 0.4)})`;
        ctxColor.fillRect(bx, by, cw - 6, rh - 6);
        const bv = Math.floor(165 + rand() * 55);
        ctxBump.fillStyle = `rgb(${bv},${bv},${bv})`;
        ctxBump.fillRect(bx, by, cw - 6, rh - 6);
      }
    }
    return {
      map: wrapTexture(cColor, 2.2, 2.2, true, maxAniso),
      bumpMap: wrapTexture(cBump, 2.2, 2.2, false, maxAniso),
    };
  }

  if (finish === 'pedra_madeira') {
    ctxColor.fillStyle = '#6A655D';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#383838';
    ctxBump.fillRect(0, 0, size, size);

    const rows = 16;
    const rh = size / rows;
    for (let r = 0; r < rows; r++) {
      let cx = 0;
      while (cx < size) {
        const sw = 48 + Math.floor(rand() * 75);
        const tone = Math.floor(115 + rand() * 68);
        const warm = Math.floor(rand() * 24);
        ctxColor.fillStyle = `rgb(${tone + warm}, ${tone + Math.floor(warm * 0.5)}, ${tone - 8})`;
        ctxColor.fillRect(cx + 2, r * rh + 2, sw - 4, rh - 4);
        const bv = Math.floor(140 + rand() * 105);
        ctxBump.fillStyle = `rgb(${bv},${bv},${bv})`;
        ctxBump.fillRect(cx + 2, r * rh + 2, sw - 4, rh - 4);
        cx += sw;
      }
    }
    return {
      map: wrapTexture(cColor, 2, 2, true, maxAniso),
      bumpMap: wrapTexture(cBump, 2, 2, false, maxAniso),
    };
  }

  if (finish === 'ripado_madeira') {
    ctxColor.fillStyle = '#3B281B';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#303030';
    ctxBump.fillRect(0, 0, size, size);

    const slats = 16;
    const sw = size / slats;
    for (let s = 0; s < slats; s++) {
      const shift = Math.floor((rand() - 0.5) * 20);
      ctxColor.fillStyle = `rgb(${164 + shift}, ${108 + Math.floor(shift * 0.7)}, ${64 + Math.floor(shift * 0.4)})`;
      ctxColor.fillRect(s * sw + 4, 0, sw - 8, size);
      for (let g = 0; g < 18; g++) {
        ctxColor.fillStyle = 'rgba(65,36,15,0.18)';
        ctxColor.fillRect(s * sw + 4 + rand() * (sw - 10), 0, 1.5, size);
      }
      ctxBump.fillStyle = '#DFDFDF';
      ctxBump.fillRect(s * sw + 4, 0, sw - 8, size);
    }
    return {
      map: wrapTexture(cColor, 2.5, 1.2, true, maxAniso),
      bumpMap: wrapTexture(cBump, 2.5, 1.2, false, maxAniso),
    };
  }

  if (finish === 'cimento_queimado') {
    ctxColor.fillStyle = '#7E848D';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#808080';
    ctxBump.fillRect(0, 0, size, size);
    for (let i = 0; i < 420; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 14 + rand() * 38;
      ctxColor.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(25,28,35,0.05)';
      ctxColor.beginPath();
      ctxColor.arc(x, y, r, 0, Math.PI * 2);
      ctxColor.fill();
    }
    ctxColor.strokeStyle = 'rgba(45,48,54,0.35)';
    ctxColor.lineWidth = 2;
    ctxColor.strokeRect(1, 1, size - 2, size - 2);
    return {
      map: wrapTexture(cColor, 2, 2, true, maxAniso),
      bumpMap: wrapTexture(cBump, 2, 2, false, maxAniso),
    };
  }

  // 'textura_acrilica' or 'reboco_liso'
  ctxColor.fillStyle = baseHex;
  ctxColor.fillRect(0, 0, size, size);
  ctxBump.fillStyle = '#808080';
  ctxBump.fillRect(0, 0, size, size);
  const grainCount = finish === 'textura_acrilica' ? 4800 : 1400;
  for (let i = 0; i < grainCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const w = finish === 'textura_acrilica' ? 2 + rand() * 3.5 : 1 + rand() * 1.6;
    const h = finish === 'textura_acrilica' ? 1 + rand() * 2 : w;
    ctxColor.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)';
    ctxColor.fillRect(x, y, w, h);
    const bv = Math.floor(finish === 'textura_acrilica' ? 96 + rand() * 64 : 120 + rand() * 16);
    ctxBump.fillStyle = `rgb(${bv},${bv},${bv})`;
    ctxBump.fillRect(x, y, w, h);
  }
  return {
    map: wrapTexture(cColor, 2.2, 2.2, true, maxAniso),
    bumpMap: wrapTexture(cBump, 2.2, 2.2, false, maxAniso),
  };
}

/**
 * Generates interior wall finish textures (matte paint, burnt cement, subway tile, warm wood panel).
 */
export function createWallInteriorTextures(
  finish: WallInteriorFinish,
  baseHex: string,
  maxAniso = 4,
): ProceduralTextureSet {
  const size = 256;
  const [cColor, ctxColor] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);
  const rand = seededRand(5150);

  if (finish === 'ceramica_metro') {
    ctxColor.fillStyle = '#D8DDE3';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#4A4A4A';
    ctxBump.fillRect(0, 0, size, size);
    const rows = 8;
    const cols = 4;
    const rh = size / rows;
    const cw = size / cols;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : cw / 2;
      for (let c = -1; c <= cols; c++) {
        ctxColor.fillStyle = '#F8FAFC';
        ctxColor.fillRect(c * cw + off + 2, r * rh + 2, cw - 4, rh - 4);
        ctxBump.fillStyle = '#DCDCDC';
        ctxBump.fillRect(c * cw + off + 2, r * rh + 2, cw - 4, rh - 4);
      }
    }
    return {
      map: wrapTexture(cColor, 2, 2, true, maxAniso),
      bumpMap: wrapTexture(cBump, 2, 2, false, maxAniso),
    };
  }

  if (finish === 'madeira_acoplada') {
    return createWallExteriorTextures('ripado_madeira', baseHex, maxAniso);
  }

  if (finish === 'cimento_queimado') {
    return createWallExteriorTextures('cimento_queimado', '#8E949D', maxAniso);
  }

  // 'pintura_fosca'
  ctxColor.fillStyle = baseHex;
  ctxColor.fillRect(0, 0, size, size);
  ctxBump.fillStyle = '#808080';
  ctxBump.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    ctxColor.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
    ctxColor.fillRect(rand() * size, rand() * size, 2, 2);
  }
  return {
    map: wrapTexture(cColor, 2, 2, true, maxAniso),
    bumpMap: wrapTexture(cBump, 2, 2, false, maxAniso),
  };
}

export function createFacadeStuccoTextures(
  baseHex: string,
  maxAniso = 4,
): ProceduralTextureSet {
  return createWallExteriorTextures('textura_acrilica', baseHex, maxAniso);
}

/**
 * Generates indoor floor finish textures (6 finishes).
 */
export function createFloorTextures(
  variant: FloorFinishMaterial,
  maxAniso = 4,
): ProceduralTextureSet {
  const size = 512;
  const [cColor, ctxColor] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);
  const rand = seededRand(9182);

  if (variant === 'madeira_carvalho' || variant === 'piso_vinilico') {
    const isVinyl = variant === 'piso_vinilico';
    ctxColor.fillStyle = isVinyl ? '#C4A17A' : '#B88959';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#909090';
    ctxBump.fillRect(0, 0, size, size);

    const planks = isVinyl ? 8 : 6;
    const plankH = size / planks;
    for (let p = 0; p < planks; p++) {
      const y0 = p * plankH;
      const toneShift = Math.floor((rand() - 0.5) * (isVinyl ? 12 : 22));
      const baseR = isVinyl ? 196 : 182;
      const baseG = isVinyl ? 162 : 135;
      const baseB = isVinyl ? 122 : 88;
      ctxColor.fillStyle = `rgb(${baseR + toneShift}, ${baseG + toneShift}, ${baseB + Math.floor(toneShift * 0.7)})`;
      ctxColor.fillRect(0, y0, size, plankH - 1.5);

      for (let g = 0; g < 30; g++) {
        const gy = y0 + rand() * (plankH - 4);
        ctxColor.fillStyle = rand() > 0.5 ? 'rgba(95,60,30,0.10)' : 'rgba(240,215,185,0.09)';
        ctxColor.fillRect(0, gy, size, 1.5);
      }

      ctxColor.fillStyle = 'rgba(70,45,25,0.45)';
      ctxColor.fillRect(0, y0 + plankH - 1.5, size, 1.5);
      const jointX = ((p * 173) % (size - 80)) + 40;
      ctxColor.fillRect(jointX, y0, 1.5, plankH);

      ctxBump.fillStyle = '#555555';
      ctxBump.fillRect(0, y0 + plankH - 1.5, size, 1.5);
      ctxBump.fillRect(jointX, y0, 1.5, plankH);
    }

    return {
      map: wrapTexture(cColor, 2.5, 2.5, true, maxAniso),
      bumpMap: wrapTexture(cBump, 2.5, 2.5, false, maxAniso),
    };
  }

  if (variant === 'cimento_queimado') {
    ctxColor.fillStyle = '#848A92';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#828282';
    ctxBump.fillRect(0, 0, size, size);

    for (let i = 0; i < 400; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const rad = 14 + rand() * 36;
      ctxColor.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(30,34,40,0.045)';
      ctxColor.beginPath();
      ctxColor.arc(x, y, rad, 0, Math.PI * 2);
      ctxColor.fill();
    }

    ctxColor.strokeStyle = 'rgba(55,60,68,0.45)';
    ctxColor.lineWidth = 2;
    ctxColor.strokeRect(1, 1, size - 2, size - 2);
    ctxBump.strokeStyle = '#585858';
    ctxBump.lineWidth = 2;
    ctxBump.strokeRect(1, 1, size - 2, size - 2);

    return {
      map: wrapTexture(cColor, 3, 3, true, maxAniso),
      bumpMap: wrapTexture(cBump, 3, 3, false, maxAniso),
    };
  }

  if (variant === 'porcelanato_marmorizado') {
    ctxColor.fillStyle = '#EFECE6';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#929292';
    ctxBump.fillRect(0, 0, size, size);
    // Calacatta subtle veins
    for (let v = 0; v < 24; v++) {
      ctxColor.strokeStyle = rand() > 0.35 ? 'rgba(130,126,118,0.22)' : 'rgba(176,148,108,0.16)';
      ctxColor.lineWidth = 1 + rand() * 2.5;
      ctxColor.beginPath();
      let vx = rand() * size;
      let vy = rand() * size;
      ctxColor.moveTo(vx, vy);
      for (let s = 0; s < 5; s++) {
        vx += (rand() - 0.35) * 90;
        vy += (rand() - 0.5) * 80;
        ctxColor.lineTo(vx, vy);
      }
      ctxColor.stroke();
    }
    const tiles = 2;
    const tileS = size / tiles;
    ctxColor.strokeStyle = '#C9C4BA';
    ctxColor.lineWidth = 2;
    ctxBump.fillStyle = '#565656';
    for (let i = 0; i < tiles; i++) {
      ctxColor.strokeRect(i * tileS, 0, tileS, size);
      ctxColor.strokeRect(0, i * tileS, size, tileS);
      ctxBump.fillRect(0, i * tileS, size, 2);
      ctxBump.fillRect(i * tileS, 0, 2, size);
    }
    return {
      map: wrapTexture(cColor, 3.2, 3.2, true, maxAniso),
      bumpMap: wrapTexture(cBump, 3.2, 3.2, false, maxAniso),
    };
  }

  // Porcelain or beige ceramic grid
  const isGray = variant === 'porcelanato_cinza';
  ctxColor.fillStyle = isGray ? '#9EA4AE' : '#D5C3AA';
  ctxColor.fillRect(0, 0, size, size);
  ctxBump.fillStyle = '#929292';
  ctxBump.fillRect(0, 0, size, size);

  const tiles = 2;
  const tileS = size / tiles;
  for (let tx = 0; tx < tiles; tx++) {
    for (let ty = 0; ty < tiles; ty++) {
      const delta = Math.floor((rand() - 0.5) * 10);
      ctxColor.fillStyle = isGray
        ? `rgb(${156 + delta}, ${163 + delta}, ${173 + delta})`
        : `rgb(${214 + delta}, ${196 + delta}, ${170 + delta})`;
      ctxColor.fillRect(tx * tileS + 2, ty * tileS + 2, tileS - 4, tileS - 4);

      for (let v = 0; v < 18; v++) {
        ctxColor.fillStyle = isGray ? 'rgba(255,255,255,0.04)' : 'rgba(130,105,80,0.04)';
        ctxColor.fillRect(
          tx * tileS + 4 + rand() * (tileS - 18),
          ty * tileS + 4 + rand() * (tileS - 8),
          12 + rand() * 24,
          1.5,
        );
      }

      ctxBump.fillStyle = '#484848';
      ctxBump.fillRect(tx * tileS, ty * tileS, tileS, 3);
      ctxBump.fillRect(tx * tileS, ty * tileS, 3, tileS);
    }
  }

  return {
    map: wrapTexture(cColor, 4, 4, true, maxAniso),
    bumpMap: wrapTexture(cBump, 4, 4, false, maxAniso),
  };
}

/**
 * Generates roof covering textures (4 variants).
 */
export function createRoofTextures(
  variant: RoofFinishMaterial,
  maxAniso = 4,
): ProceduralTextureSet {
  const size = 256;
  const [cColor, ctxColor] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);

  if (variant === 'termoacustica_zinco') {
    ctxColor.fillStyle = '#6D7682';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#707070';
    ctxBump.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 24) {
      ctxColor.fillStyle = '#8993A0';
      ctxColor.fillRect(x, 0, 8, size);
      ctxColor.fillStyle = '#525964';
      ctxColor.fillRect(x + 8, 0, 4, size);

      ctxBump.fillStyle = '#CFCFCF';
      ctxBump.fillRect(x, 0, 8, size);
      ctxBump.fillStyle = '#404040';
      ctxBump.fillRect(x + 8, 0, 4, size);
    }
  } else if (variant === 'ceramica_terracota') {
    ctxColor.fillStyle = '#A8523A';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#7A7A7A';
    ctxBump.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 32) {
      ctxColor.fillStyle = 'rgba(65,24,14,0.35)';
      ctxColor.fillRect(0, y, size, 4);
      ctxBump.fillStyle = '#484848';
      ctxBump.fillRect(0, y, size, 4);
    }
    for (let x = 0; x < size; x += 28) {
      ctxColor.fillStyle = 'rgba(240,160,120,0.16)';
      ctxColor.fillRect(x, 0, 9, size);
      ctxBump.fillStyle = '#B8B8B8';
      ctxBump.fillRect(x, 0, 9, size);
    }
  } else if (variant === 'fibrocimento_cinza') {
    ctxColor.fillStyle = '#7B8088';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#808080';
    ctxBump.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 18) {
      ctxColor.fillStyle = 'rgba(255,255,255,0.08)';
      ctxColor.fillRect(x, 0, 7, size);
      ctxColor.fillStyle = 'rgba(0,0,0,0.12)';
      ctxColor.fillRect(x + 8, 0, 5, size);
      ctxBump.fillStyle = '#BEBEBE';
      ctxBump.fillRect(x, 0, 8, size);
      ctxBump.fillStyle = '#4A4A4A';
      ctxBump.fillRect(x + 8, 0, 7, size);
    }
  } else {
    ctxColor.fillStyle = '#90959C';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#808080';
    ctxBump.fillRect(0, 0, size, size);
    ctxColor.strokeStyle = 'rgba(60,64,70,0.3)';
    ctxColor.strokeRect(2, 2, size - 4, size - 4);
  }

  return {
    map: wrapTexture(cColor, 4, 4, true, maxAniso),
    bumpMap: wrapTexture(cBump, 4, 4, false, maxAniso),
  };
}

/**
 * Generates high-detail exterior landscaping surface textures (grass, non-slip tiles, burnt cement, sand, gravel, timber deck, pavers).
 */
export function createExteriorSurfaceTextures(
  surfaceType: ExteriorSurfaceType,
  maxAniso = 4,
): ProceduralTextureSet {
  const size = 256;
  const [cColor, ctxColor] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);
  const rand = seededRand(7741);

  if (surfaceType === 'grama_esmeralda' || surfaceType === 'grama_sao_carlos' || surfaceType === 'grama_amendoim') {
    const base =
      surfaceType === 'grama_sao_carlos'
        ? '#3E7137'
        : surfaceType === 'grama_amendoim'
          ? '#49823A'
          : '#497C40';
    ctxColor.fillStyle = base;
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#7A7A7A';
    ctxBump.fillRect(0, 0, size, size);
    for (let i = 0; i < 3200; i++) {
      const x = rand() * size;
      const y = rand() * size;
      ctxColor.fillStyle =
        rand() > 0.45 ? 'rgba(135,190,105,0.22)' : 'rgba(28,55,24,0.24)';
      ctxColor.fillRect(x, y, 2, 4);
      const b = Math.floor(96 + rand() * 75);
      ctxBump.fillStyle = `rgb(${b},${b},${b})`;
      ctxBump.fillRect(x, y, 2, 4);
    }
    if (surfaceType === 'grama_amendoim') {
      for (let f = 0; f < 55; f++) {
        ctxColor.fillStyle = '#F2CF38';
        ctxColor.beginPath();
        ctxColor.arc(rand() * size, rand() * size, 2.2, 0, Math.PI * 2);
        ctxColor.fill();
      }
    }
    return {
      map: wrapTexture(cColor, 4, 4, true, maxAniso),
      bumpMap: wrapTexture(cBump, 4, 4, false, maxAniso),
    };
  }

  if (surfaceType === 'deck_madeira') {
    ctxColor.fillStyle = '#8F5A33';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#404040';
    ctxBump.fillRect(0, 0, size, size);
    const slats = 8;
    const sh = size / slats;
    for (let s = 0; s < slats; s++) {
      const shift = Math.floor((rand() - 0.5) * 18);
      ctxColor.fillStyle = `rgb(${156 + shift}, ${100 + Math.floor(shift * 0.7)}, ${58 + Math.floor(shift * 0.4)})`;
      ctxColor.fillRect(0, s * sh + 2, size, sh - 4);
      ctxColor.fillStyle = '#332014';
      ctxColor.fillRect(0, s * sh + sh - 2, size, 2);
      ctxBump.fillStyle = '#D4D4D4';
      ctxBump.fillRect(0, s * sh + 2, size, sh - 4);
    }
    return {
      map: wrapTexture(cColor, 3, 3, true, maxAniso),
      bumpMap: wrapTexture(cBump, 3, 3, false, maxAniso),
    };
  }

  if (surfaceType === 'paver_intertravado') {
    ctxColor.fillStyle = '#6B645C';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#404040';
    ctxBump.fillRect(0, 0, size, size);
    const rows = 8;
    const cols = 4;
    const rh = size / rows;
    const cw = size / cols;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : cw / 2;
      for (let c = -1; c <= cols; c++) {
        const tone = Math.floor(148 + rand() * 32);
        ctxColor.fillStyle = `rgb(${tone + 8}, ${tone}, ${tone - 10})`;
        ctxColor.fillRect(c * cw + off + 2, r * rh + 2, cw - 4, rh - 4);
        ctxBump.fillStyle = '#D2D2D2';
        ctxBump.fillRect(c * cw + off + 2, r * rh + 2, cw - 4, rh - 4);
      }
    }
    return {
      map: wrapTexture(cColor, 3, 3, true, maxAniso),
      bumpMap: wrapTexture(cBump, 3, 3, false, maxAniso),
    };
  }

  if (surfaceType === 'areia') {
    ctxColor.fillStyle = '#D9C398';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#808080';
    ctxBump.fillRect(0, 0, size, size);
    for (let i = 0; i < 4500; i++) {
      const x = rand() * size;
      const y = rand() * size;
      ctxColor.fillStyle = rand() > 0.5 ? 'rgba(255,248,225,0.22)' : 'rgba(155,128,82,0.18)';
      ctxColor.fillRect(x, y, 2, 2);
      const b = Math.floor(110 + rand() * 44);
      ctxBump.fillStyle = `rgb(${b},${b},${b})`;
      ctxBump.fillRect(x, y, 2, 2);
    }
    return {
      map: wrapTexture(cColor, 4, 4, true, maxAniso),
      bumpMap: wrapTexture(cBump, 4, 4, false, maxAniso),
    };
  }

  if (surfaceType === 'brita') {
    ctxColor.fillStyle = '#73777E';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#555555';
    ctxBump.fillRect(0, 0, size, size);
    for (let i = 0; i < 650; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 3 + rand() * 5;
      const v = Math.floor(120 + rand() * 85);
      ctxColor.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      ctxColor.beginPath();
      ctxColor.arc(x, y, r, 0, Math.PI * 2);
      ctxColor.fill();
      ctxBump.fillStyle = `rgb(${Math.min(255, v + 30)},${Math.min(255, v + 30)},${Math.min(255, v + 30)})`;
      ctxBump.beginPath();
      ctxBump.arc(x, y, r, 0, Math.PI * 2);
      ctxBump.fill();
    }
    return {
      map: wrapTexture(cColor, 3.5, 3.5, true, maxAniso),
      bumpMap: wrapTexture(cBump, 3.5, 3.5, false, maxAniso),
    };
  }

  if (surfaceType === 'cimento_queimado') {
    return createFloorTextures('cimento_queimado', maxAniso);
  }

  // 'piso_antiderrapante'
  ctxColor.fillStyle = '#C7C1B6';
  ctxColor.fillRect(0, 0, size, size);
  ctxBump.fillStyle = '#828282';
  ctxBump.fillRect(0, 0, size, size);
  for (let i = 0; i < 2400; i++) {
    ctxColor.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.09)' : 'rgba(90,82,70,0.09)';
    ctxColor.fillRect(rand() * size, rand() * size, 2, 2);
  }
  ctxColor.strokeStyle = '#9D968A';
  ctxColor.lineWidth = 2;
  ctxColor.strokeRect(0, 0, 128, 128);
  ctxColor.strokeRect(128, 0, 128, 128);
  ctxColor.strokeRect(0, 128, 128, 128);
  ctxColor.strokeRect(128, 128, 128, 128);
  return {
    map: wrapTexture(cColor, 3.5, 3.5, true, maxAniso),
    bumpMap: wrapTexture(cBump, 3.5, 3.5, false, maxAniso),
  };
}

export function createPoolTileTexture(
  linerColor: PoolSpec['linerColor'],
  maxAniso = 4,
): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = makeCanvas(size);
  const rand = seededRand(8811);
  const palette =
    linerColor === 'turquesa_hijau'
      ? [
          [32, 138, 132],
          [44, 162, 152],
          [26, 118, 114],
        ]
      : linerColor === 'ardosia'
        ? [
            [45, 76, 94],
            [56, 92, 112],
            [38, 62, 78],
          ]
        : [
            [24, 122, 186],
            [36, 148, 212],
            [18, 102, 162],
          ];
  ctx.fillStyle = '#D8EEF5';
  ctx.fillRect(0, 0, size, size);
  const tiles = 12;
  const s = size / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const col = palette[Math.floor(rand() * palette.length)];
      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      ctx.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
    }
  }
  return wrapTexture(c, 5, 5, true, maxAniso);
}

export function createWaterRippleBumpTexture(maxAniso = 4): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / size) * Math.PI * 2;
      const ny = (y / size) * Math.PI * 2;
      const h =
        Math.sin(nx * 3 + Math.cos(ny * 2)) * 0.35 +
        Math.cos(ny * 4 + Math.sin(nx * 2)) * 0.35 +
        Math.sin((nx + ny) * 5) * 0.3;
      const v = Math.floor(128 + h * 90);
      const idx = (y * size + x) * 4;
      img.data[idx] = v;
      img.data[idx + 1] = v;
      img.data[idx + 2] = v;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return wrapTexture(c, 3, 3, false, maxAniso);
}

/**
 * Generates brushed concrete sidewalk & urban street asphalt textures for site surroundings.
 */
export function createSiteContextTextures(maxAniso = 4): {
  sidewalkMap: THREE.CanvasTexture;
  asphaltMap: THREE.CanvasTexture;
  grassMap: THREE.CanvasTexture;
} {
  const [cSw, ctxSw] = makeCanvas(256);
  ctxSw.fillStyle = '#B8BDC4';
  ctxSw.fillRect(0, 0, 256, 256);
  ctxSw.strokeStyle = '#9197A0';
  ctxSw.lineWidth = 3;
  ctxSw.strokeRect(0, 0, 128, 128);
  ctxSw.strokeRect(128, 0, 128, 128);
  ctxSw.strokeRect(0, 128, 128, 128);
  ctxSw.strokeRect(128, 128, 128, 128);

  const [cAs, ctxAs] = makeCanvas(256);
  ctxAs.fillStyle = '#2B2F36';
  ctxAs.fillRect(0, 0, 256, 256);
  const rand = seededRand(4242);
  for (let i = 0; i < 3000; i++) {
    ctxAs.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctxAs.fillRect(rand() * 256, rand() * 256, 2, 2);
  }

  const grassSet = createExteriorSurfaceTextures('grama_esmeralda', maxAniso);

  return {
    sidewalkMap: wrapTexture(cSw, 6, 2, true, maxAniso),
    asphaltMap: wrapTexture(cAs, 8, 2, true, maxAniso),
    grassMap: grassSet.map,
  };
}
