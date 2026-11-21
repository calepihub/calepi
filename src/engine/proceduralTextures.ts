import * as THREE from 'three';

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
 * Generates subtle architectural plaster / acrylic facade texture + bump map.
 */
export function createFacadeStuccoTextures(
  baseHex: string,
  maxAniso = 4,
): ProceduralTextureSet {
  const size = 256;
  const [cColor, ctxColor] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);

  ctxColor.fillStyle = baseHex;
  ctxColor.fillRect(0, 0, size, size);

  ctxBump.fillStyle = '#808080';
  ctxBump.fillRect(0, 0, size, size);

  // Subtle architectural trowel grain (deterministic pseudo-random)
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 2400; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1 + rand() * 2.2;
    const delta = rand() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.035)';
    ctxColor.fillStyle = delta;
    ctxColor.fillRect(x, y, r, r);

    const bVal = Math.floor(114 + rand() * 28);
    ctxBump.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
    ctxBump.fillRect(x, y, r, r);
  }

  return {
    map: wrapTexture(cColor, 2, 2, true, maxAniso),
    bumpMap: wrapTexture(cBump, 2, 2, false, maxAniso),
  };
}

/**
 * Generates realistic floor finish textures: porcelain tiles, beige ceramic, oak planks, or burnt cement.
 */
export function createFloorTextures(
  variant: 'porcelanato_cinza' | 'ceramica_bege' | 'madeira_carvalho' | 'cimento_queimado',
  maxAniso = 4,
): ProceduralTextureSet {
  const size = 512;
  const [cColor, ctxColor] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);

  let seed = 9182;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  if (variant === 'madeira_carvalho') {
    ctxColor.fillStyle = '#B88959';
    ctxColor.fillRect(0, 0, size, size);
    ctxBump.fillStyle = '#909090';
    ctxBump.fillRect(0, 0, size, size);

    const planks = 6;
    const plankH = size / planks;
    for (let p = 0; p < planks; p++) {
      const y0 = p * plankH;
      const toneShift = Math.floor((rand() - 0.5) * 22);
      ctxColor.fillStyle = `rgb(${182 + toneShift}, ${135 + toneShift}, ${88 + Math.floor(toneShift * 0.7)})`;
      ctxColor.fillRect(0, y0, size, plankH - 2);

      // Wood grain streaks
      for (let g = 0; g < 35; g++) {
        const gy = y0 + rand() * (plankH - 4);
        ctxColor.fillStyle = rand() > 0.5 ? 'rgba(95,60,30,0.12)' : 'rgba(235,205,170,0.1)';
        ctxColor.fillRect(0, gy, size, 1.5);
      }

      // Plank seams
      ctxColor.fillStyle = 'rgba(70,45,25,0.55)';
      ctxColor.fillRect(0, y0 + plankH - 2, size, 2);
      const jointX = ((p * 173) % (size - 80)) + 40;
      ctxColor.fillRect(jointX, y0, 2, plankH);

      ctxBump.fillStyle = '#505050';
      ctxBump.fillRect(0, y0 + plankH - 2, size, 2);
      ctxBump.fillRect(jointX, y0, 2, plankH);
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
      const shade = rand() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(30,34,40,0.045)';
      ctxColor.fillStyle = shade;
      ctxColor.beginPath();
      ctxColor.arc(x, y, rad, 0, Math.PI * 2);
      ctxColor.fill();
    }

    // Subtle expansion joints
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

  // Porcelain or beige ceramic grid 4x4
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

      // Stone vein subtle detail
      for (let v = 0; v < 18; v++) {
        ctxColor.fillStyle = isGray ? 'rgba(255,255,255,0.04)' : 'rgba(130,105,80,0.04)';
        ctxColor.fillRect(
          tx * tileS + 4 + rand() * (tileS - 18),
          ty * tileS + 4 + rand() * (tileS - 8),
          12 + rand() * 24,
          1.5,
        );
      }

      // Grout lines
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
 * Generates roof covering textures (standing-seam zinc/thermoacoustic, terracotta clay, waterproofed slab).
 */
export function createRoofTextures(
  variant: 'termoacustica_zinco' | 'ceramica_terracota' | 'concreto_impermeabilizado',
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
 * Generates brushed concrete sidewalk & urban street asphalt textures for site surroundings.
 */
export function createSiteContextTextures(maxAniso = 4): {
  sidewalkMap: THREE.CanvasTexture;
  asphaltMap: THREE.CanvasTexture;
  grassMap: THREE.CanvasTexture;
} {
  // Sidewalk
  const [cSw, ctxSw] = makeCanvas(256);
  ctxSw.fillStyle = '#B8BDC4';
  ctxSw.fillRect(0, 0, 256, 256);
  ctxSw.strokeStyle = '#9197A0';
  ctxSw.lineWidth = 3;
  ctxSw.strokeRect(0, 0, 128, 128);
  ctxSw.strokeRect(128, 0, 128, 128);
  ctxSw.strokeRect(0, 128, 128, 128);
  ctxSw.strokeRect(128, 128, 128, 128);

  // Asphalt
  const [cAs, ctxAs] = makeCanvas(256);
  ctxAs.fillStyle = '#2B2F36';
  ctxAs.fillRect(0, 0, 256, 256);
  let seed = 4242;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 3000; i++) {
    ctxAs.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctxAs.fillRect(rand() * 256, rand() * 256, 2, 2);
  }

  // Grass lawn
  const [cGr, ctxGr] = makeCanvas(256);
  ctxGr.fillStyle = '#4B6B46';
  ctxGr.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2200; i++) {
    ctxGr.fillStyle = rand() > 0.5 ? 'rgba(130,175,110,0.16)' : 'rgba(40,65,35,0.18)';
    ctxGr.fillRect(rand() * 256, rand() * 256, 2, 4);
  }

  return {
    sidewalkMap: wrapTexture(cSw, 6, 2, true, maxAniso),
    asphaltMap: wrapTexture(cAs, 8, 2, true, maxAniso),
    grassMap: wrapTexture(cGr, 6, 6, true, maxAniso),
  };
}
