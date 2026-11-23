import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  BookmarkPlus,
  Camera,
  ChevronDown,
  ChevronUp,
  Download,
  Leaf,
  Moon,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Trees,
  Waves,
} from 'lucide-react';
import {
  buildBotanicalPlant3D,
  buildGourmetArea3D,
  buildPool3D,
  buildRoofGeometryGroup,
} from '../engine/botanical3D';
import {
  getBoundingBox,
  getOpeningWorldPosition,
  getWallAngleRad,
  getWallLength,
  round2,
} from '../engine/geometry';
import {
  getGateWorldPosition,
  getLotBoundarySegments,
  normalizeSiteData,
} from '../engine/implantation';
import {
  BOTANICAL_SPECIES_CATALOG,
  createDefaultLandscaping,
  getBotanicalMeta,
} from '../engine/landscaping';
import { nextId } from '../engine/parametricGenerator';
import {
  createExteriorSurfaceTextures,
  createFloorTextures,
  createRoofTextures,
  createSiteContextTextures,
  createWallExteriorTextures,
  createWallInteriorTextures,
} from '../engine/proceduralTextures';
import type {
  BotanicalSpeciesId,
  CapturedRender,
  Opening,
  Project,
  Wall,
} from '../types/project';

interface CinematicRenderStudioProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
  onSaveRender?: (render: CapturedRender) => void;
}

type CineLightingPreset = 'manha' | 'meiodia' | 'golden' | 'crepusculo' | 'noite';
type CineCameraPreset = 'fachada' | 'piscina' | 'gourmet' | 'aerea' | 'botanica' | 'interna';

const LIGHTING_PRESETS: Array<{
  id: CineLightingPreset;
  label: string;
  elevation: number;
  azimuth: number;
  turbidity: number;
  rayleigh: number;
  mieCoeff: number;
  mieG: number;
  sunIntensity: number;
  sunHex: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  envIntensity: number;
  exposure: number;
  bloomStrength: number;
  bloomThreshold: number;
  isNight: boolean;
  timeTag: 'dia' | 'entardecer' | 'noite';
}> = [
  {
    id: 'manha',
    label: 'Manhã 08h',
    elevation: 28,
    azimuth: 118,
    turbidity: 3.6,
    rayleigh: 1.45,
    mieCoeff: 0.0035,
    mieG: 0.74,
    sunIntensity: 2.1,
    sunHex: 0xfff1d6,
    hemiSkyHex: 0xcbe8ff,
    hemiGroundHex: 0x3b4d38,
    hemiIntensity: 0.56,
    envIntensity: 0.28,
    exposure: 0.74,
    bloomStrength: 0.0,
    bloomThreshold: 1.8,
    isNight: false,
    timeTag: 'dia',
  },
  {
    id: 'meiodia',
    label: 'Meio-Dia 12h',
    elevation: 58,
    azimuth: 165,
    turbidity: 2.4,
    rayleigh: 1.05,
    mieCoeff: 0.0022,
    mieG: 0.7,
    sunIntensity: 2.3,
    sunHex: 0xfffcf5,
    hemiSkyHex: 0xdbeafe,
    hemiGroundHex: 0x42523f,
    hemiIntensity: 0.6,
    envIntensity: 0.3,
    exposure: 0.7,
    bloomStrength: 0.0,
    bloomThreshold: 1.85,
    isNight: false,
    timeTag: 'dia',
  },
  {
    id: 'golden',
    label: 'Golden Hour 17h',
    elevation: 14,
    azimuth: 245,
    turbidity: 5.8,
    rayleigh: 2.25,
    mieCoeff: 0.007,
    mieG: 0.78,
    sunIntensity: 2.05,
    sunHex: 0xffb870,
    hemiSkyHex: 0xfde6c4,
    hemiGroundHex: 0x382d2b,
    hemiIntensity: 0.45,
    envIntensity: 0.22,
    exposure: 0.78,
    bloomStrength: 0.05,
    bloomThreshold: 1.65,
    isNight: false,
    timeTag: 'entardecer',
  },
  {
    id: 'crepusculo',
    label: 'Crepúsculo 18h30',
    elevation: 22,
    azimuth: 258,
    turbidity: 8.0,
    rayleigh: 2.8,
    mieCoeff: 0.01,
    mieG: 0.8,
    sunIntensity: 0.65,
    sunHex: 0x93c5fd,
    hemiSkyHex: 0x64748b,
    hemiGroundHex: 0x1e2430,
    hemiIntensity: 0.32,
    envIntensity: 0.12,
    exposure: 0.86,
    bloomStrength: 0.1,
    bloomThreshold: 1.4,
    isNight: true,
    timeTag: 'entardecer',
  },
  {
    id: 'noite',
    label: 'Noturno 21h',
    elevation: 36,
    azimuth: 295,
    turbidity: 1.5,
    rayleigh: 0.35,
    mieCoeff: 0.002,
    mieG: 0.65,
    sunIntensity: 0.42,
    sunHex: 0x93c5fd,
    hemiSkyHex: 0x1e293b,
    hemiGroundHex: 0x0f172a,
    hemiIntensity: 0.24,
    envIntensity: 0.07,
    exposure: 0.9,
    bloomStrength: 0.12,
    bloomThreshold: 1.35,
    isNight: true,
    timeTag: 'noite',
  },
];

const FOCAL_LENGTHS: Array<{ mm: number; fov: number; label: string }> = [
  { mm: 24, fov: 53, label: '24mm Wide' },
  { mm: 35, fov: 38, label: '35mm Arq.' },
  { mm: 50, fov: 27, label: '50mm Retrato' },
  { mm: 85, fov: 17, label: '85mm Tele' },
];

function probeSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    const isSoftware = /SwiftShader|llvmpipe|Software|Mesa/i.test(rendererStr);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return isSoftware;
  } catch {
    return true;
  }
}

function buildWallWithOpenings(
  len: number,
  height: number,
  thickness: number,
  wallOpenings: Opening[],
): THREE.BufferGeometry {
  if (wallOpenings.length === 0) {
    const g = new THREE.BoxGeometry(len, height, thickness);
    g.translate(0, height / 2, 0);
    return g;
  }
  const shape = new THREE.Shape();
  shape.moveTo(-len / 2, 0);
  shape.lineTo(len / 2, 0);
  shape.lineTo(len / 2, height);
  shape.lineTo(-len / 2, height);
  shape.closePath();

  for (const op of wallOpenings) {
    const x0 = Math.max(-len / 2 + 0.03, -len / 2 + op.offsetAlongWall);
    const x1 = Math.min(len / 2 - 0.03, -len / 2 + op.offsetAlongWall + op.width);
    const y0 = Math.max(0.01, op.sillHeight);
    const y1 = Math.min(height - 0.05, y0 + op.height);
    if (x1 > x0 + 0.05 && y1 > y0 + 0.05) {
      const hole = new THREE.Path();
      hole.moveTo(x0, y0);
      hole.lineTo(x1, y0);
      hole.lineTo(x1, y1);
      hole.lineTo(x0, y1);
      hole.closePath();
      shape.holes.push(hole);
    }
  }
  const geom = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  geom.translate(0, 0, -thickness / 2);
  return geom;
}

export const CinematicRenderStudio: React.FC<CinematicRenderStudioProps> = ({
  project,
  onUpdateProject,
  onSaveRender,
}) => {
  const [studioTab, setStudioTab] = useState<'render' | 'botanica'>('render');
  const [lightingId, setLightingId] = useState<CineLightingPreset>('golden');
  const [cameraId, setCameraId] = useState<CineCameraPreset>('fachada');
  const [focalMm, setFocalMm] = useState<number>(35);
  const [exposureBoost, setExposureBoost] = useState<number>(1.0);
  const [animateWater, setAnimateWater] = useState<boolean>(true);
  const [dockVisible, setDockVisible] = useState<boolean>(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAllSpecies, setShowAllSpecies] = useState<boolean>(false);
  const [botanicalPortraits, setBotanicalPortraits] = useState<Record<string, string>>({});

  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const skyRef = useRef<Sky | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const waterMatsRef = useRef<Array<THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial>>([]);
  const isSoftwareGlRef = useRef<boolean>(false);
  const animateWaterRef = useRef<boolean>(true);
  animateWaterRef.current = animateWater;

  const landscaping = useMemo(
    () => project.landscaping ?? createDefaultLandscaping(project.site),
    [project.landscaping, project.site],
  );

  const siteBox = useMemo(() => getBoundingBox(project.site.vertices), [project.site.vertices]);
  const centerOffset = useMemo(
    () => ({ x: siteBox.minX + siteBox.width / 2, z: siteBox.minY + siteBox.depth / 2 }),
    [siteBox],
  );

  const activePreset = useMemo(
    () => LIGHTING_PRESETS.find((p) => p.id === lightingId) ?? LIGHTING_PRESETS[2],
    [lightingId],
  );

  // Keyboard H shortcut to toggle HUD cleanly for unobstructed cinematic framing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'h' || e.key === 'H') {
        setDockVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Initialize standalone WebGL2 PBR Engine + Sky + RoomEnvironment + EffectComposer
  useEffect(() => {
    if (studioTab !== 'render') return;
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = probeSoftwareWebGL();
    isSoftwareGlRef.current = isSoftwareGl;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    const initW = Math.max(320, container.clientWidth);
    const initH = Math.max(260, container.clientHeight);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(initW, initH);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    if (!isSoftwareGl) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Physical Sky dome
    const sky = new Sky();
    sky.scale.setScalar(4500);
    scene.add(sky);
    skyRef.current = sky;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.72;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(38, initW / initH, 0.15, 600);
    camera.position.set(14, 5.2, 16);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI / 2 - 0.01;
    controls.minDistance = 1.8;
    controls.maxDistance = 85;
    controls.target.set(0, 1.5, 0);
    controls.update();
    controlsRef.current = controls;

    const hemi = new THREE.HemisphereLight(0xfde6c4, 0x382d2b, 0.85);
    scene.add(hemi);
    hemiLightRef.current = hemi;

    const sun = new THREE.DirectionalLight(0xffb36b, 2.4);
    sun.position.set(-22, 10, 18);
    if (!isSoftwareGl) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 110;
      sun.shadow.camera.left = -28;
      sun.shadow.camera.right = 28;
      sun.shadow.camera.top = 28;
      sun.shadow.camera.bottom = -28;
      sun.shadow.bias = -0.00035;
    }
    scene.add(sun);
    sunLightRef.current = sun;

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // EffectComposer strictly guarded behind !isSoftwareGl
    let composer: EffectComposer | null = null;
    if (!isSoftwareGl) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(initW, initH), 0.05, 0.25, 1.65);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      composerRef.current = composer;
      bloomPassRef.current = bloom;
    } else {
      composerRef.current = null;
      bloomPassRef.current = null;
    }

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(280, container.clientWidth);
      const h = Math.max(240, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer?.setSize(w, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    let disposed = false;
    let rafId = 0;
    let lastT = performance.now();

    const tick = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      if (controls.enableDamping) {
        controls.update();
      }
      if (animateWaterRef.current && waterMatsRef.current.length > 0) {
        for (const wMat of waterMatsRef.current) {
          if (wMat.bumpMap) {
            wMat.bumpMap.offset.x = (wMat.bumpMap.offset.x + dt * 0.045) % 1;
            wMat.bumpMap.offset.y = (wMat.bumpMap.offset.y + dt * 0.03) % 1;
          }
        }
      }

      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }

      if (!isSoftwareGl) {
        rafId = requestAnimationFrame(tick);
      } else {
        // Under software WebGL, pace frame loop lightly so CPU stays responsive
        rafId = window.setTimeout(() => {
          if (!disposed) requestAnimationFrame(tick);
        }, 90) as unknown as number;
      }
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(rafId);
      ro.disconnect();
      controls.dispose();
      composer?.dispose();
      envRT.dispose();
      renderer.dispose();
    };
  }, [studioTab]);

  // Update physical Sky + Sun + Exposure + Focal length whenever lighting/camera settings change
  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const sky = skyRef.current;
    const sun = sunLightRef.current;
    const hemi = hemiLightRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !sky || !sun || !hemi || !camera) return;

    const p = activePreset;
    const uniforms = sky.material.uniforms;
    uniforms['turbidity'].value = p.turbidity;
    uniforms['rayleigh'].value = p.rayleigh;
    uniforms['mieCoefficient'].value = p.mieCoeff;
    uniforms['mieDirectionalG'].value = p.mieG;
    if (uniforms['showSunDisc']) {
      uniforms['showSunDisc'].value = 0;
    }

    const phi = THREE.MathUtils.degToRad(90 - p.elevation);
    const theta = THREE.MathUtils.degToRad(p.azimuth);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    uniforms['sunPosition'].value.copy(sunDir);

    sun.position.copy(sunDir).multiplyScalar(45);
    sun.intensity = p.sunIntensity;
    sun.color.setHex(p.sunHex);

    hemi.color.setHex(p.hemiSkyHex);
    hemi.groundColor.setHex(p.hemiGroundHex);
    hemi.intensity = p.hemiIntensity;
    scene.environmentIntensity = p.envIntensity;

    scene.fog = !isSoftwareGlRef.current
      ? new THREE.FogExp2(p.isNight ? 0x0b1220 : p.id === 'golden' ? 0xd9a07b : 0xcbdcf0, p.isNight ? 0.008 : 0.004)
      : null;

    if (p.isNight) {
      sky.visible = false;
      scene.background = new THREE.Color(p.id === 'crepusculo' ? 0x221e33 : 0x070c17);
    } else {
      sky.visible = true;
    }

    renderer.toneMappingExposure = round2(p.exposure * exposureBoost);
    if (bloomPassRef.current) {
      bloomPassRef.current.strength = p.bloomStrength;
      bloomPassRef.current.threshold = p.bloomThreshold;
      bloomPassRef.current.radius = 0.25;
    }

    const focal = FOCAL_LENGTHS.find((f) => f.mm === focalMm) ?? FOCAL_LENGTHS[1];
    camera.fov = focal.fov;
    camera.updateProjectionMatrix();
  }, [activePreset, exposureBoost, focalMm]);

  // Populate 3D Architectural & Botanical Scene
  useEffect(() => {
    if (studioTab !== 'render') return;
    const group = modelGroupRef.current;
    const renderer = rendererRef.current;
    if (!group || !renderer) return;

    const disposableTex: THREE.Texture[] = [];
    while (group.children.length > 0) {
      const ch = group.children[0];
      group.remove(ch);
      ch.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            const std = m as THREE.MeshStandardMaterial;
            std.map?.dispose();
            std.bumpMap?.dispose();
            m.dispose();
          });
        }
      });
    }
    waterMatsRef.current = [];

    const isSoftwareGl = isSoftwareGlRef.current;
    const maxAniso = isSoftwareGl ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const rs = project.renderSettings;
    const nightOn = activePreset.isNight || rs.artificialLightsOn;
    const gardenLit = activePreset.isNight && (landscaping.gardenLightsOn ?? true);

    // 1. Neighborhood Ground & Urban Street Context
    const extGroundTex = createExteriorSurfaceTextures(landscaping.defaultGroundSurface, maxAniso);
    const ctxTex = createSiteContextTextures(maxAniso);
    const wallExtTex = createWallExteriorTextures(rs.wallExteriorFinish ?? 'textura_acrilica', rs.facadeColor || '#EAECEE', maxAniso);
    const wallIntTex = createWallInteriorTextures(rs.wallInteriorFinish ?? 'pintura_fosca', rs.interiorWallColor || '#F5F6F8', maxAniso);
    const floorTex = createFloorTextures(rs.floorMaterial, maxAniso);
    const roofTex = createRoofTextures(rs.roofMaterial, maxAniso);

    disposableTex.push(
      extGroundTex.map,
      ctxTex.sidewalkMap,
      ctxTex.asphaltMap,
      ctxTex.grassMap,
      wallExtTex.map,
      wallIntTex.map,
      floorTex.map,
      roofTex.map,
    );
    if (extGroundTex.bumpMap) disposableTex.push(extGroundTex.bumpMap);
    if (wallExtTex.bumpMap) disposableTex.push(wallExtTex.bumpMap);
    if (wallIntTex.bumpMap) disposableTex.push(wallIntTex.bumpMap);
    if (floorTex.bumpMap) disposableTex.push(floorTex.bumpMap);
    if (roofTex.bumpMap) disposableTex.push(roofTex.bumpMap);

    const earth = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({
        color: activePreset.isNight ? 0x121914 : 0x3b4a36,
        roughness: 0.96,
      }),
    );
    earth.rotation.x = -Math.PI / 2;
    earth.position.y = -0.18;
    earth.receiveShadow = !isSoftwareGl;
    group.add(earth);

    const normSite = normalizeSiteData(project.site);
    const boundarySegs = getLotBoundarySegments(normSite);
    const frontSeg = boundarySegs.find((s) => s.side === 'front') ?? boundarySegs[0];

    if (frontSeg) {
      const streetG = new THREE.Group();
      const midX = (frontSeg.a.x + frontSeg.b.x) / 2 - centerOffset.x;
      const midZ = (frontSeg.a.y + frontSeg.b.y) / 2 - centerOffset.z;
      streetG.position.set(midX, 0, midZ);
      streetG.rotation.y = Math.atan2(-frontSeg.inwardNormal.x, -frontSeg.inwardNormal.y);
      const frontLen = Math.max(8, frontSeg.lengthM);

      const sw = new THREE.Mesh(
        new THREE.BoxGeometry(frontLen + 20, 0.12, 2.5),
        new THREE.MeshStandardMaterial({ map: ctxTex.sidewalkMap, roughness: 0.84 }),
      );
      sw.position.set(0, -0.06, 1.25);
      sw.receiveShadow = !isSoftwareGl;
      streetG.add(sw);

      const asphalt = new THREE.Mesh(
        new THREE.BoxGeometry(frontLen + 36, 0.08, 8.0),
        new THREE.MeshStandardMaterial({ map: ctxTex.asphaltMap, roughness: 0.9 }),
      );
      asphalt.position.set(0, -0.14, 6.5);
      asphalt.receiveShadow = !isSoftwareGl;
      streetG.add(asphalt);
      group.add(streetG);
    }

    // Lot ground surface polygon
    const siteShape = new THREE.Shape();
    project.site.vertices.forEach((v, idx) => {
      const sx = v.x - centerOffset.x;
      const sz = -(v.y - centerOffset.z);
      if (idx === 0) siteShape.moveTo(sx, sz);
      else siteShape.lineTo(sx, sz);
    });
    siteShape.closePath();
    const siteGeo = new THREE.ExtrudeGeometry(siteShape, { depth: 0.16, bevelEnabled: false });
    siteGeo.rotateX(-Math.PI / 2);
    const siteMat = new THREE.MeshStandardMaterial({
      map: extGroundTex.map,
      bumpMap: extGroundTex.bumpMap,
      bumpScale: 0.025,
      roughness: 0.88,
    });
    const siteMesh = new THREE.Mesh(siteGeo, siteMat);
    siteMesh.position.y = -0.16;
    siteMesh.receiveShadow = !isSoftwareGl;
    group.add(siteMesh);

    // Exterior paved/gravel/sand/deck zones
    for (const zone of landscaping.surfaceZones) {
      const zTex = createExteriorSurfaceTextures(zone.surfaceType, maxAniso);
      disposableTex.push(zTex.map);
      if (zTex.bumpMap) disposableTex.push(zTex.bumpMap);
      const zMesh = new THREE.Mesh(
        new THREE.BoxGeometry(zone.width, 0.026, zone.depth),
        new THREE.MeshStandardMaterial({
          map: zTex.map,
          bumpMap: zTex.bumpMap,
          bumpScale: 0.02,
          roughness: zone.surfaceType === 'deck_madeira' ? 0.62 : 0.86,
        }),
      );
      zMesh.position.set(
        zone.x + zone.width / 2 - centerOffset.x,
        0.013,
        zone.y + zone.depth / 2 - centerOffset.z,
      );
      zMesh.receiveShadow = !isSoftwareGl;
      group.add(zMesh);
    }

    // Perimeter Boundary Walls & Gates
    const muroMat = new THREE.MeshStandardMaterial({
      map: wallExtTex.map,
      bumpMap: wallExtTex.bumpMap,
      bumpScale: 0.015,
      color: 0xd9dde3,
      roughness: 0.84,
    });
    const muroCapMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.35 });
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x1e242d, roughness: 0.35, metalness: 0.65 });

    for (const seg of boundarySegs) {
      if (seg.lengthM < 0.3) continue;
      const ux = (seg.b.x - seg.a.x) / seg.lengthM;
      const uy = (seg.b.y - seg.a.y) / seg.lengthM;
      const ang = Math.atan2(uy, ux);
      const gatesOnSeg = normSite.accesses
        .filter((g) => g.enabled && g.side === seg.side)
        .map((g) => {
          const start = Math.max(0, Math.min(seg.lengthM - 0.3, g.offsetM));
          const end = Math.min(seg.lengthM, start + Math.max(0.5, g.widthM));
          return { gate: g, start, end };
        })
        .sort((a, b) => a.start - b.start);

      const spans: Array<[number, number]> = [];
      let cursor = 0;
      for (const gi of gatesOnSeg) {
        if (gi.start > cursor + 0.05) spans.push([cursor, gi.start]);
        cursor = Math.max(cursor, gi.end);
      }
      if (cursor < seg.lengthM - 0.05) spans.push([cursor, seg.lengthM]);

      if (seg.boundary.condition !== 'aberta') {
        const wallH = Math.max(0.8, seg.boundary.heightM || 2.0);
        for (const [s0, s1] of spans) {
          const spanLen = s1 - s0;
          if (spanLen < 0.15) continue;
          const midT = (s0 + s1) / 2;
          const wx = seg.a.x + ux * midT - centerOffset.x;
          const wz = seg.a.y + uy * midT - centerOffset.z;
          const wallMuro = new THREE.Mesh(new THREE.BoxGeometry(spanLen, wallH, 0.14), muroMat);
          wallMuro.position.set(wx, wallH / 2, wz);
          wallMuro.rotation.y = -ang;
          wallMuro.castShadow = !isSoftwareGl;
          wallMuro.receiveShadow = !isSoftwareGl;
          const cap = new THREE.Mesh(new THREE.BoxGeometry(spanLen, 0.05, 0.18), muroCapMat);
          cap.position.set(wx, wallH + 0.025, wz);
          cap.rotation.y = -ang;
          group.add(wallMuro, cap);
        }
      }

      for (const gi of gatesOnSeg) {
        const gw = getGateWorldPosition(normSite, gi.gate);
        if (!gw) continue;
        const gateW = Math.max(0.6, gi.end - gi.start);
        const gateH = gi.gate.type === 'veiculo' ? 2.1 : 1.95;
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(gateW - 0.08, gateH - 0.1, 0.05), gateMat);
        leaf.position.set(gw.center.x - centerOffset.x, gateH / 2, gw.center.y - centerOffset.z);
        leaf.rotation.y = -ang;
        leaf.castShadow = !isSoftwareGl;
        group.add(leaf);
      }
    }

    // Pools (with live waterMat ref)
    for (const pool of landscaping.pools) {
      const worldPool = { ...pool, x: pool.x - centerOffset.x, y: pool.y - centerOffset.z };
      const built = buildPool3D(worldPool, 0.015, nightOn, isSoftwareGl, maxAniso);
      waterMatsRef.current.push(built.waterMat);
      group.add(built.group);
    }

    // Gourmet Pergola & Grill Areas
    for (const gSpec of landscaping.gourmetAreas) {
      const worldG = { ...gSpec, x: gSpec.x - centerOffset.x, y: gSpec.y - centerOffset.z };
      group.add(buildGourmetArea3D(worldG, 0.015, nightOn, isSoftwareGl));
    }

    // Botanical 3D Flora
    for (const pl of landscaping.plants) {
      const plantG = buildBotanicalPlant3D(pl.speciesId, pl.scale, isSoftwareGl);
      plantG.position.set(pl.x - centerOffset.x, 0, pl.y - centerOffset.z);
      plantG.rotation.y = ((pl.rotationDeg ?? 0) * Math.PI) / 180;
      group.add(plantG);

      if (gardenLit) {
        const uplight = new THREE.PointLight(0xfde68a, 0.38, 2.8, 2);
        uplight.position.set(pl.x - centerOffset.x, 0.25, pl.y - centerOffset.z);
        group.add(uplight);
      }
    }

    // 2. Architectural Buildings + PBR Cladding + Authentic Roof
    const matExt = new THREE.MeshStandardMaterial({
      map: wallExtTex.map,
      bumpMap: wallExtTex.bumpMap,
      bumpScale: 0.018,
      color:
        rs.wallExteriorFinish === 'textura_acrilica' || rs.wallExteriorFinish === 'reboco_liso' || !rs.wallExteriorFinish
          ? 0xffffff
          : 0xf8fafc,
      roughness: rs.wallExteriorFinish === 'cimento_queimado' ? 0.6 : 0.82,
      side: THREE.DoubleSide,
    });
    const matInt = new THREE.MeshStandardMaterial({
      map: wallIntTex.map,
      bumpMap: wallIntTex.bumpMap,
      bumpScale: 0.012,
      roughness: rs.wallInteriorFinish === 'ceramica_metro' ? 0.32 : 0.84,
      side: THREE.DoubleSide,
    });
    const matFloor = new THREE.MeshStandardMaterial({
      map: floorTex.map,
      bumpMap: floorTex.bumpMap,
      bumpScale: 0.012,
      roughness: rs.floorMaterial?.startsWith('porcelanato') ? 0.28 : 0.55,
    });
    const matRoof = new THREE.MeshStandardMaterial({
      map: roofTex.map,
      bumpMap: roofTex.bumpMap,
      bumpScale: 0.025,
      roughness: rs.roofMaterial === 'termoacustica_zinco' ? 0.42 : 0.65,
      metalness: rs.roofMaterial === 'termoacustica_zinco' ? 0.48 : 0.08,
    });
    const frameHex =
      rs.windowFrameColor === 'aluminio_branco'
        ? 0xe5e7eb
        : rs.windowFrameColor === 'madeira'
          ? 0x7c4d2b
          : 0x1b2028;
    const matFrame = new THREE.MeshStandardMaterial({ color: frameHex, roughness: 0.35, metalness: 0.58 });
    const matGlass = new THREE.MeshPhysicalMaterial({
      color: 0xaad8ff,
      transparent: true,
      opacity: nightOn ? 0.25 : 0.38,
      roughness: 0.05,
      metalness: 0.1,
      reflectivity: 0.92,
    });
    const matDoor = new THREE.MeshStandardMaterial({ color: 0x8f5d38, roughness: 0.55 });
    const matWood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.66 });
    const matLightSlab = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.78 });

    const mapUnitPt = (
      inst: { x: number; y: number; rotationDeg: number; mirrored: boolean },
      utW: number,
      lx: number,
      ly: number,
    ) => {
      const mx = inst.mirrored ? utW - lx : lx;
      const rad = (inst.rotationDeg * Math.PI) / 180;
      return {
        x: inst.x + (mx * Math.cos(rad) - ly * Math.sin(rad)) - centerOffset.x,
        z: inst.y + (mx * Math.sin(rad) + ly * Math.cos(rad)) - centerOffset.z,
      };
    };

    let minBX = Infinity;
    let maxBX = -Infinity;
    let minBZ = Infinity;
    let maxBZ = -Infinity;

    project.floors.forEach((floor, fIdx) => {
      const baseY = floor.elevation;
      floor.units.forEach((inst) => {
        const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
        if (!ut) return;

        const c0 = mapUnitPt(inst, ut.width, 0, 0);
        const c1 = mapUnitPt(inst, ut.width, ut.width, ut.depth);
        minBX = Math.min(minBX, c0.x, c1.x);
        maxBX = Math.max(maxBX, c0.x, c1.x);
        minBZ = Math.min(minBZ, c0.z, c1.z);
        maxBZ = Math.max(maxBZ, c0.z, c1.z);

        const slabC = mapUnitPt(inst, ut.width, ut.width / 2, ut.depth / 2);
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(ut.width, floor.slabThickness, ut.depth),
          matLightSlab,
        );
        slab.position.set(slabC.x, baseY + floor.slabThickness / 2, slabC.z);
        slab.rotation.y = -(inst.rotationDeg * Math.PI) / 180;
        slab.receiveShadow = !isSoftwareGl;
        slab.castShadow = !isSoftwareGl;
        group.add(slab);

        const floorFinish = new THREE.Mesh(
          new THREE.BoxGeometry(ut.width - 0.08, 0.025, ut.depth - 0.08),
          matFloor,
        );
        floorFinish.position.set(slabC.x, baseY + floor.slabThickness + 0.012, slabC.z);
        floorFinish.rotation.y = -(inst.rotationDeg * Math.PI) / 180;
        floorFinish.receiveShadow = !isSoftwareGl;
        group.add(floorFinish);

        if (nightOn && fIdx === 0) {
          const interiorLight = new THREE.PointLight(0xffdca8, activePreset.isNight ? 1.55 : 0.75, 6.5, 2);
          interiorLight.position.set(slabC.x, baseY + floor.slabThickness + ut.ceilingHeight - 0.35, slabC.z);
          group.add(interiorLight);
        }

        const opsByWall = new Map<string, Opening[]>();
        for (const op of ut.openings) {
          const list = opsByWall.get(op.wallId) ?? [];
          list.push(op);
          opsByWall.set(op.wallId, list);
        }

        for (const w of ut.walls as Wall[]) {
          const len = getWallLength(w);
          if (len < 0.05) continue;
          const pA = mapUnitPt(inst, ut.width, w.start.x, w.start.y);
          const pB = mapUnitPt(inst, ut.width, w.end.x, w.end.y);
          const geom = buildWallWithOpenings(len, w.height, w.thickness, opsByWall.get(w.id) ?? []);
          const wallMesh = new THREE.Mesh(geom, w.isExternal ? matExt : matInt);
          wallMesh.position.set((pA.x + pB.x) / 2, baseY + floor.slabThickness, (pA.z + pB.z) / 2);
          wallMesh.rotation.y = -Math.atan2(pB.z - pA.z, pB.x - pA.x);
          wallMesh.castShadow = !isSoftwareGl;
          wallMesh.receiveShadow = !isSoftwareGl;
          group.add(wallMesh);
        }

        for (const op of ut.openings) {
          const wall = ut.walls.find((w) => w.id === op.wallId);
          if (!wall) continue;
          const pos = getOpeningWorldPosition(wall, op);
          const wp = mapUnitPt(inst, ut.width, pos.center.x, pos.center.y);
          const wallAng = getWallAngleRad(wall) + (inst.rotationDeg * Math.PI) / 180;
          const rotY = inst.mirrored ? wallAng : -wallAng;
          const y0 = baseY + floor.slabThickness + op.sillHeight;

          if (op.type === 'janela') {
            const jg = new THREE.Group();
            jg.position.set(wp.x, y0 + op.height / 2, wp.z);
            jg.rotation.y = rotY;
            jg.add(new THREE.Mesh(new THREE.BoxGeometry(op.width - 0.05, op.height - 0.05, 0.02), matGlass));
            const head = new THREE.Mesh(new THREE.BoxGeometry(op.width, 0.04, wall.thickness + 0.02), matFrame);
            head.position.y = op.height / 2;
            const sill = head.clone();
            sill.position.y = -op.height / 2;
            jg.add(head, sill);
            group.add(jg);
          } else {
            const dg = new THREE.Group();
            dg.position.set(wp.x, y0 + op.height / 2, wp.z);
            dg.rotation.y = rotY;
            const leaf = new THREE.Mesh(new THREE.BoxGeometry(op.width - 0.05, op.height - 0.04, 0.04), matDoor);
            leaf.castShadow = !isSoftwareGl;
            dg.add(leaf);
            group.add(dg);
          }
        }

        // Furniture simplified high-impact solids
        for (const f of ut.furniture) {
          const fc = mapUnitPt(inst, ut.width, f.x + f.width / 2, f.y + f.depth / 2);
          const fMesh = new THREE.Mesh(
            new THREE.BoxGeometry(f.width, Math.max(0.25, f.height * 0.7), f.depth),
            f.category === 'cama' || f.category === 'sofa'
              ? new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.85 })
              : matWood,
          );
          fMesh.position.set(fc.x, baseY + floor.slabThickness + (f.elevationM ?? 0) + (f.height * 0.35), fc.z);
          fMesh.rotation.y = -((inst.rotationDeg + f.rotationDeg) * Math.PI) / 180;
          fMesh.castShadow = !isSoftwareGl;
          fMesh.receiveShadow = !isSoftwareGl;
          group.add(fMesh);
        }
      });
    });

    // Authentic 3D Roof matching selected roofShape + roofMaterial
    if (Number.isFinite(minBX)) {
      const topFl = project.floors[project.floors.length - 1];
      const roofBaseY = (topFl?.elevation ?? 0) + (topFl?.floorToFloorHeight ?? 2.95);
      group.add(
        buildRoofGeometryGroup({
          x: minBX - 0.15,
          y: minBZ - 0.15,
          width: maxBX - minBX + 0.3,
          depth: maxBZ - minBZ + 0.3,
          baseElevationY: roofBaseY,
          roofShape: rs.roofShape ?? 'platibanda',
          roofFinish: rs.roofMaterial,
          slopePercent: project.constructionMethod.roofSlopePercent,
          facadeMat: matExt,
          roofMat: matRoof,
          isSoftwareGl,
        }),
      );
    }

    return () => {
      disposableTex.forEach((t) => t.dispose());
    };
  }, [project, landscaping, centerOffset, activePreset, studioTab]);

  // Apply Camera Preset framing
  const applyCameraPreset = (preset: CineCameraPreset) => {
    setCameraId(preset);
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;

    const halfW = siteBox.width / 2;
    const halfD = siteBox.depth / 2;
    const firstPool = landscaping.pools[0];
    const firstGourmet = landscaping.gourmetAreas[0];
    const firstPlant = landscaping.plants[0];
    const firstInst = project.floors[0]?.units[0];
    const firstUt = firstInst ? project.unitTypes.find((t) => t.id === firstInst.unitTypeId) : undefined;

    if (preset === 'piscina' && firstPool) {
      const px = firstPool.x + firstPool.width / 2 - centerOffset.x;
      const pz = firstPool.y + firstPool.depth / 2 - centerOffset.z;
      cam.position.set(px + 3.4, 2.3, pz + 3.8);
      ctrl.target.set(px, 0.3, pz);
    } else if (preset === 'gourmet' && firstGourmet) {
      const gx = firstGourmet.x + firstGourmet.width / 2 - centerOffset.x;
      const gz = firstGourmet.y + firstGourmet.depth / 2 - centerOffset.z;
      cam.position.set(gx - 2.9, 2.0, gz + 3.4);
      ctrl.target.set(gx, 1.1, gz);
    } else if (preset === 'botanica' && firstPlant) {
      const bx = firstPlant.x - centerOffset.x;
      const bz = firstPlant.y - centerOffset.z;
      cam.position.set(bx + 3.2, 2.1, bz + 3.4);
      ctrl.target.set(bx, 1.5, bz);
    } else if (preset === 'aerea') {
      const span = Math.max(10, siteBox.width, siteBox.depth);
      cam.position.set(-span * 0.9, span * 0.85, span * 0.95);
      ctrl.target.set(0, 1.2, 0);
    } else if (preset === 'interna' && firstInst && firstUt) {
      cam.position.set(
        firstInst.x + firstUt.width * 0.78 - centerOffset.x,
        1.58,
        firstInst.y + firstUt.depth * 0.82 - centerOffset.z,
      );
      ctrl.target.set(
        firstInst.x + firstUt.width * 0.35 - centerOffset.x,
        0.95,
        firstInst.y + 1.2 - centerOffset.z,
      );
    } else {
      // Street facade oblique shot
      cam.position.set(halfW * 0.95 + 3.5, 3.6, halfD + 7.2);
      ctrl.target.set(0, 1.8, -halfD * 0.15);
    }
    ctrl.update();
  };

  const handleDownloadHD = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const cam = cameraRef.current;
    const composer = composerRef.current;
    if (!renderer || !scene || !cam) return;
    if (composer) composer.render();
    else renderer.render(scene, cam);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${project.code}_Render_Cinematografico_${lightingId}_${cameraId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setNotice('Imagem cinematográfica PNG exportada em alta definição!');
    setTimeout(() => setNotice(null), 4000);
  };

  const handleSaveToPranchaR01 = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const cam = cameraRef.current;
    const composer = composerRef.current;
    if (!renderer || !scene || !cam) return;
    if (composer) composer.render();
    else renderer.render(scene, cam);
    const srcCanvas = renderer.domElement;

    const encodeAtWidth = (maxW: number, mime: 'image/png' | 'image/jpeg', q?: number) => {
      const targetW = Math.min(maxW, srcCanvas.width);
      const scale = targetW / srcCanvas.width;
      const off = document.createElement('canvas');
      off.width = targetW;
      off.height = Math.max(1, Math.round(srcCanvas.height * scale));
      const ctx = off.getContext('2d');
      if (!ctx) return srcCanvas.toDataURL(mime, q);
      ctx.drawImage(srcCanvas, 0, 0, off.width, off.height);
      return off.toDataURL(mime, q);
    };

    let dataUrl = encodeAtWidth(960, 'image/png');
    if (dataUrl.length > 680000) dataUrl = encodeAtWidth(960, 'image/jpeg', 0.86);
    if (dataUrl.length > 680000) dataUrl = encodeAtWidth(760, 'image/jpeg', 0.8);

    const entry: CapturedRender = {
      id: nextId('rnd'),
      title: `Cinematográfico — ${cameraId.toUpperCase()} · ${activePreset.label}`,
      preset: cameraId,
      timeOfDay: activePreset.timeTag,
      dataUrl,
      createdAt: new Date().toISOString(),
    };
    onUpdateProject(
      (prev) => ({
        ...prev,
        capturedRenders: [entry, ...(prev.capturedRenders ?? [])].slice(0, 8),
      }),
      `Captura cinematográfica salva na Prancha R01 (${entry.title})`,
    );
    onSaveRender?.(entry);
    setNotice('Render cinematográfico salvo na Prancha R01 (Firestore) e ZIP!');
    setTimeout(() => setNotice(null), 4500);
  };

  // Generate isolated real 3D studio botanical specimen plates via one shared offscreen WebGLRenderer
  const plantedSpeciesCounts = useMemo(() => {
    const counts = new Map<BotanicalSpeciesId, number>();
    for (const pl of landscaping.plants) {
      counts.set(pl.speciesId, (counts.get(pl.speciesId) ?? 0) + 1);
    }
    return counts;
  }, [landscaping.plants]);

  const botanicalPlateSpecies = useMemo(() => {
    if (showAllSpecies || plantedSpeciesCounts.size === 0) {
      return BOTANICAL_SPECIES_CATALOG;
    }
    return BOTANICAL_SPECIES_CATALOG.filter((sp) => plantedSpeciesCounts.has(sp.id));
  }, [showAllSpecies, plantedSpeciesCounts]);

  useEffect(() => {
    if (studioTab !== 'botanica') return;
    const missing = botanicalPlateSpecies.filter((sp) => !botanicalPortraits[sp.id]);
    if (missing.length === 0) return;

    const isSw = probeSoftwareWebGL();
    const offRenderer = new THREE.WebGLRenderer({ antialias: !isSw, alpha: false, preserveDrawingBuffer: true });
    offRenderer.setSize(340, 340);
    offRenderer.outputColorSpace = THREE.SRGBColorSpace;
    offRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    offRenderer.toneMappingExposure = 1.08;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f1eb);
    const hemi = new THREE.HemisphereLight(0xfffbeb, 0x475569, 1.1);
    const key = new THREE.DirectionalLight(0xfff5e0, 2.2);
    key.position.set(5, 8, 6);
    const rim = new THREE.DirectionalLight(0xbae6fd, 0.9);
    rim.position.set(-5, 4, -5);
    scene.add(hemi, key, rim);

    // Pedestal turf disk
    const soilDisk = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.15, 0.08, 24),
      new THREE.MeshStandardMaterial({ color: 0x5c7c4a, roughness: 0.9 }),
    );
    soilDisk.position.y = -0.04;
    scene.add(soilDisk);

    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    const nextImages: Record<string, string> = {};

    for (const sp of missing) {
      const specimen = buildBotanicalPlant3D(sp.id, 1.0, isSw);
      scene.add(specimen);
      const box = new THREE.Box3().setFromObject(specimen);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const maxDim = Math.max(1.2, size.y, size.x, size.z);
      const dist = (maxDim / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.42;
      cam.position.set(dist * 0.65, center.y + size.y * 0.12, dist * 0.85);
      cam.lookAt(center);
      offRenderer.render(scene, cam);
      nextImages[sp.id] = offRenderer.domElement.toDataURL('image/png');
      scene.remove(specimen);
      specimen.traverse((obj) => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (m.material) {
          const ms = Array.isArray(m.material) ? m.material : [m.material];
          ms.forEach((mat) => mat.dispose());
        }
      });
    }

    soilDisk.geometry.dispose();
    (soilDisk.material as THREE.Material).dispose();
    offRenderer.dispose();

    setBotanicalPortraits((prev) => ({ ...prev, ...nextImages }));
  }, [studioTab, botanicalPlateSpecies, botanicalPortraits]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#0E1116] text-slate-100">
      {/* Studio Mode Switcher Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#171A20] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">
            Estúdio Cinematográfico &amp; Pranchas Botânicas
          </span>
          <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-medium text-emerald-300">
            WebGL2 PBR Gratuito (Zero Custo API)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStudioTab('render')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${
              studioTab === 'render'
                ? 'bg-[#2F7CF6] text-white'
                : 'border border-slate-700 bg-[#14161A] text-slate-300 hover:text-white'
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
            Renderizador Cinematográfico 3D
          </button>
          <button
            type="button"
            onClick={() => setStudioTab('botanica')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${
              studioTab === 'botanica'
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-700 bg-[#14161A] text-slate-300 hover:text-white'
            }`}
          >
            <Trees className="h-3.5 w-3.5" />
            Pranchas Botânicas Reais ({landscaping.plants.length} plantadas)
          </button>
        </div>
      </div>

      {studioTab === 'render' ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div ref={mountRef} className="h-full w-full" />

          {/* Top Compact HUD Bar (no backdrop-blur over WebGL) */}
          <div className="pointer-events-none absolute inset-x-4 top-3 flex flex-wrap items-center justify-between gap-2">
            <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-lg border border-slate-700 bg-[#171A20] p-1 shadow-xl">
              {(
                [
                  ['fachada', 'Fachada Rua'],
                  ['piscina', 'Piscina & Deck'],
                  ['gourmet', 'Área Gourmet'],
                  ['botanica', 'Detalhe Árvores'],
                  ['aerea', 'Vista Aérea'],
                  ['interna', 'Interior Kitnet'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => applyCameraPreset(id)}
                  className={`rounded px-2.5 py-1 text-[11.5px] font-medium transition ${
                    cameraId === id
                      ? 'bg-[#2F7CF6] text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 bg-[#171A20] p-1.5 shadow-xl">
              {notice && (
                <span className="px-2 text-[11px] font-medium text-emerald-400">{notice}</span>
              )}
              <button
                type="button"
                onClick={handleSaveToPranchaR01}
                className="inline-flex items-center gap-1 rounded border border-emerald-500/50 bg-emerald-600/20 px-2.5 py-1 text-[11.5px] font-medium text-emerald-200 hover:bg-emerald-600/40"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                Salvar na Prancha R01
              </button>
              <button
                type="button"
                onClick={handleDownloadHD}
                className="inline-flex items-center gap-1 rounded bg-[#2F7CF6] px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-[#2567d4]"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar HD PNG
              </button>
            </div>
          </div>

          {/* Collapsible Bottom Cinematic Director Dock */}
          <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
            <div className="pointer-events-auto w-full max-w-[1080px] rounded-lg border border-slate-700 bg-[#171A20] shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 px-3.5 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {LIGHTING_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setLightingId(preset.id)}
                      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
                        lightingId === preset.id
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'bg-[#14161A] text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {preset.id === 'manha' && <Sunrise className="h-3.5 w-3.5" />}
                      {preset.id === 'meiodia' && <Sun className="h-3.5 w-3.5" />}
                      {preset.id === 'golden' && <Sunset className="h-3.5 w-3.5" />}
                      {(preset.id === 'crepusculo' || preset.id === 'noite') && (
                        <Moon className="h-3.5 w-3.5" />
                      )}
                      {preset.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setDockVisible((v) => !v)}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  {dockVisible ? (
                    <>
                      Ocultar (H) <ChevronDown className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      Câmera &amp; Luz <ChevronUp className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>

              {dockVisible && (
                <div className="grid gap-4 p-3 sm:grid-cols-3">
                  <div>
                    <div className="mb-1 text-[11px] text-slate-400">Lente Cinematográfica</div>
                    <div className="flex gap-1">
                      {FOCAL_LENGTHS.map((f) => (
                        <button
                          key={f.mm}
                          type="button"
                          onClick={() => setFocalMm(f.mm)}
                          className={`flex-1 rounded border px-1.5 py-1 text-[11px] ${
                            focalMm === f.mm
                              ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white'
                              : 'border-slate-700 bg-[#14161A] text-slate-400'
                          }`}
                        >
                          {f.mm}mm
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Exposição ACES Filmic</span>
                      <span className="font-mono text-white">{exposureBoost.toFixed(2)}×</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.05}
                      value={exposureBoost}
                      onChange={(e) => setExposureBoost(Number(e.target.value))}
                      className="w-full accent-[#2F7CF6]"
                    />
                  </label>

                  <div className="flex items-center justify-between gap-3 pt-2 text-xs">
                    <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={animateWater}
                        onChange={(e) => setAnimateWater(e.target.checked)}
                      />
                      <Waves className="h-3.5 w-3.5 text-cyan-400" />
                      Ondulação da Piscina
                    </label>
                    <span className="text-[10.5px] text-slate-400">
                      Arraste para orbitar · Scroll para zoom
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Real Botanical Specimen Plates Gallery */
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-[1440px] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#171A20] p-4">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                  <Leaf className="h-4 w-4 text-emerald-400" />
                  Pranchas Botânicas Realistas — Espécies do Empreendimento
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Visualização 3D isolada em estúdio de cada árvore, palmeira e espécie frutífera exatamente como modelada no projeto, acompanhada de nome científico, porte adulto e recomendações de recuo radicular.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllSpecies || plantedSpeciesCounts.size === 0}
                  onChange={(e) => setShowAllSpecies(e.target.checked)}
                />
                Exibir todas as 17 espécies do catálogo
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {botanicalPlateSpecies.map((sp) => {
                const qty = plantedSpeciesCounts.get(sp.id) ?? 0;
                const portrait = botanicalPortraits[sp.id];
                return (
                  <div
                    key={sp.id}
                    className="flex flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#171A20]"
                  >
                    <div className="relative aspect-square bg-[#F3F1EB]">
                      {portrait ? (
                        <img
                          src={portrait}
                          alt={`${sp.commonName} (${sp.scientificName})`}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-500">
                          Renderizando modelo 3D...
                        </div>
                      )}
                      <span className="absolute left-2.5 top-2.5 rounded bg-slate-900/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                        {sp.categoryLabel}
                      </span>
                      {qty > 0 && (
                        <span className="absolute right-2.5 top-2.5 rounded bg-emerald-600 px-2 py-0.5 font-mono text-[10.5px] font-bold text-white">
                          {qty} un. no lote
                        </span>
                      )}
                    </div>
                    <div className="flex-1 space-y-1.5 p-3.5 text-xs">
                      <div className="font-semibold text-white">{sp.commonName}</div>
                      <div className="italic text-[11px] text-emerald-400">{sp.scientificName}</div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">{sp.description}</p>
                      <div className="border-t border-slate-800 pt-2 text-[10.5px] text-slate-400 space-y-0.5">
                        <div>
                          Porte adulto: <strong className="text-slate-200">{sp.matureHeightM}m alt.</strong> · Copa{' '}
                          <strong className="text-slate-200">{sp.canopyDiameterM}m</strong>
                        </div>
                        <div>Exposição: {sp.sunExposure}</div>
                        <div className="text-amber-300/90">{sp.rootNote}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
