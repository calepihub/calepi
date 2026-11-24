import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BookmarkPlus,
  Camera,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Layers,
  Move,
  Palette,
  Scissors,
  Sparkles,
  Sun,
} from 'lucide-react';
import {
  analyzeSiteGeometry,
  getBoundingBox,
  getOpeningWorldPosition,
  getWallAngleRad,
  getWallLength,
  round2,
} from '../engine/geometry';
import {
  createExteriorSurfaceTextures,
  createFacadeStuccoTextures,
  createFloorTextures,
  createRoofTextures,
  createSiteContextTextures,
  createWallExteriorTextures,
  createWallInteriorTextures,
} from '../engine/proceduralTextures';
import {
  getGateWorldPosition,
  getLotBoundarySegments,
  normalizeSiteData,
} from '../engine/implantation';
import { createDefaultLandscaping } from '../engine/landscaping';
import {
  getMetalsColorHex,
  getNormalizedSanitaryFixtures,
  getSanitaryWareHex,
} from '../engine/finishesCatalog';
import {
  buildBotanicalPlant3D,
  buildGourmetArea3D,
  buildPool3D,
  buildRoofAndWaterTowerGroup,
} from '../engine/botanical3D';
import { nextId } from '../engine/parametricGenerator';
import type {
  CapturedRender,
  Opening,
  Project,
  RenderMaterialSettings,
  Wall,
} from '../types/project';

interface Bim3DViewportProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
  onSaveRender?: (render: CapturedRender) => void;
}

type LayerVisibility = {
  arquitetura: boolean;
  estrutura: boolean;
  eletrica: boolean;
  especiais: boolean;
  hidraulica: boolean;
  sanitaria: boolean;
  mobiliario: boolean;
  cobertura: boolean;
  paisagismo: boolean;
};

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

function mapFloorColor(mat: RenderMaterialSettings['floorMaterial']): number {
  switch (mat) {
    case 'ceramica_bege':
      return 0xd4c3a3;
    case 'madeira_carvalho':
      return 0xa47549;
    case 'cimento_queimado':
      return 0x7b8088;
    case 'porcelanato_marmorizado':
      return 0xedeff2;
    case 'piso_vinilico':
      return 0xb88b5a;
    default:
      return 0xb4bac2;
  }
}

function mapRoofColor(mat: RenderMaterialSettings['roofMaterial']): number {
  switch (mat) {
    case 'ceramica_terracota':
      return 0xb25438;
    case 'concreto_impermeabilizado':
      return 0x7c828b;
    case 'fibrocimento_cinza':
      return 0x6b7280;
    default:
      return 0x525b66;
  }
}

function mapFrameColor(mat: RenderMaterialSettings['windowFrameColor']): number {
  switch (mat) {
    case 'aluminio_branco':
      return 0xe5e7eb;
    case 'madeira':
      return 0x7c4d2b;
    default:
      return 0x1b2028;
  }
}

/**
 * Builds an extruded wall geometry with genuine rectangular holes for doors & windows.
 * Local coordinates before rotation: length along +X [-len/2 .. +len/2], height along +Y [0 .. h], thickness along Z [-t/2 .. +t/2].
 */
function buildWallWithOpeningsGeometry(
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
    const x0Raw = -len / 2 + op.offsetAlongWall;
    const x1Raw = x0Raw + op.width;
    const y0 = Math.max(0.01, op.sillHeight);
    const y1 = Math.min(height - 0.05, y0 + op.height);
    if (y1 > y0 + 0.05) {
      const x0 = Math.max(-len / 2 + 0.03, x0Raw);
      const x1 = Math.min(len / 2 - 0.03, x1Raw);
      if (x1 > x0 + 0.05) {
        const hole = new THREE.Path();
        hole.moveTo(x0, y0);
        hole.lineTo(x1, y0);
        hole.lineTo(x1, y1);
        hole.lineTo(x0, y1);
        hole.closePath();
        shape.holes.push(hole);
      }
    }
  }

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geom.translate(0, 0, -thickness / 2);
  return geom;
}

export const Bim3DViewport: React.FC<Bim3DViewportProps> = ({
  project,
  onUpdateProject,
  onSaveRender,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const interiorLightsGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const selectionBoxRef = useRef<THREE.BoxHelper | null>(null);
  const requestRenderRef = useRef<() => void>(() => {});
  const isSoftwareGlRef = useRef<boolean>(false);
  const buildingBoundsRef = useRef<{
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    maxY: number;
  }>({ minX: -5, maxX: 5, minZ: -5, maxZ: 5, maxY: 6 });
  const unitViewsRef = useRef<
    Array<{
      id: string;
      unitNumber: string;
      utCode: string;
      eye: THREE.Vector3;
      target: THREE.Vector3;
    }>
  >([]);

  const [dockOpen, setDockOpen] = useState(true);
  const [dockTab, setDockTab] = useState<'disciplinas' | 'corte' | 'iluminacao'>('disciplinas');
  const [activeCameraPreset, setActiveCameraPreset] = useState<string>('perspectiva');
  const [selectedInternalUnitIdx, setSelectedInternalUnitIdx] = useState<number>(0);
  const [layers, setLayers] = useState<LayerVisibility>({
    arquitetura: true,
    estrutura: true,
    eletrica: true,
    especiais: true,
    hidraulica: true,
    sanitaria: true,
    mobiliario: true,
    cobertura: true,
    paisagismo: true,
  });

  const totalBuildingHeight = useMemo(
    () =>
      Math.max(
        3.2,
        project.floors.reduce((s, f) => s + f.floorToFloorHeight, 0) + 1.2,
      ),
    [project.floors],
  );

  const totalUnitsPlaced = useMemo(
    () => project.floors.reduce((s, fl) => s + fl.units.length, 0),
    [project.floors],
  );

  const renderQuality = project.renderSettings.renderQuality ?? 'arquitetonico';

  const [sectionCutHeight, setSectionCutHeight] = useState<number>(12);
  const [explodedOffset, setExplodedOffset] = useState<number>(0);
  const [showRoofShell, setShowRoofShell] = useState<boolean>(true);
  const [selectedInfo, setSelectedInfo] = useState<{
    label: string;
    discipline: string;
    detail: string;
  } | null>(null);
  const [selectedOpening3D, setSelectedOpening3D] = useState<{
    unitTypeId: string;
    openingId: string;
    wallId: string;
    unitInstanceId: string;
  } | null>(null);
  const [renderNotice, setRenderNotice] = useState<string | null>(null);

  const siteBox = useMemo(() => getBoundingBox(project.site.vertices), [project.site.vertices]);
  const centerOffset = useMemo(
    () => ({
      x: siteBox.minX + siteBox.width / 2,
      z: siteBox.minY + siteBox.depth / 2,
    }),
    [siteBox],
  );

  const latestProjectRef = useRef(project);
  latestProjectRef.current = project;
  const onUpdateProjectRef = useRef(onUpdateProject);
  onUpdateProjectRef.current = onUpdateProject;
  const centerOffsetRef = useRef(centerOffset);
  centerOffsetRef.current = centerOffset;
  const dragOpeningRef = useRef<{
    unitTypeId: string;
    openingId: string;
    wallId: string;
    unitInstanceId: string;
    plane: THREE.Plane;
  } | null>(null);
  const lastDragOffsetRef = useRef<number | null>(null);

  // Initialize Three.js WebGLRenderer once
  useEffect(() => {
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
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 500);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.localClippingEnabled = true;
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
    scene.background = new THREE.Color(0xdbeafe);
    sceneRef.current = scene;

    // Studio RoomEnvironment IBL
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(
      42,
      (container.clientWidth || 800) / Math.max(1, container.clientHeight || 500),
      0.2,
      450,
    );
    camera.position.set(18, 12, 22);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 2.2, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.015;
    controls.minDistance = 4;
    controls.maxDistance = 95;
    controls.update();
    controlsRef.current = controls;

    // Lights
    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x3b4252, 0.9);
    scene.add(hemi);
    hemiLightRef.current = hemi;

    const sun = new THREE.DirectionalLight(0xfff7ed, 2.4);
    sun.position.set(18, 28, 16);
    if (!isSoftwareGl) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.near = 2;
      sun.shadow.camera.far = 95;
      sun.shadow.camera.left = -28;
      sun.shadow.camera.right = 28;
      sun.shadow.camera.top = 28;
      sun.shadow.camera.bottom = -28;
      sun.shadow.bias = -0.0004;
    }
    scene.add(sun);
    sunLightRef.current = sun;

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    const lightsGroup = new THREE.Group();
    scene.add(lightsGroup);
    interiorLightsGroupRef.current = lightsGroup;

    // Ground grid (toggled in technical mode)
    const grid = new THREE.GridHelper(70, 70, 0x334155, 0x1e293b);
    grid.position.y = -0.025;
    scene.add(grid);
    gridHelperRef.current = grid;

    let rafId = 0;
    let renderScheduled = false;
    let disposed = false;

    const drawFrame = () => {
      if (disposed) return;
      if (controls.enableDamping) {
        controls.update();
      }
      renderer.render(scene, camera);
    };

    const scheduleRender = () => {
      if (disposed || renderScheduled) return;
      renderScheduled = true;
      rafId = requestAnimationFrame(() => {
        renderScheduled = false;
        if (disposed) return;
        drawFrame();
      });
    };
    requestRenderRef.current = scheduleRender;

    const handleControlChange = () => {
      scheduleRender();
    };
    controls.addEventListener('change', handleControlChange);

    const handleResize = () => {
      if (!container || disposed) return;
      const w = Math.max(200, container.clientWidth);
      const h = Math.max(200, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      scheduleRender();
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    // Raycaster click selection + direct 3D drag along wall for doors/windows/vitrôs
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragIntersect = new THREE.Vector3();
    let pointerDownPos = { x: 0, y: 0 };

    const updatePointerFromEvent = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (ev: PointerEvent) => {
      pointerDownPos = { x: ev.clientX, y: ev.clientY };
      if (ev.button !== 0) return;
      updatePointerFromEvent(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(modelGroup.children, true);
      const opHit = hits.find((h) => h.object.userData?.openingDrag);
      if (opHit) {
        const meta = opHit.object.userData.openingDrag as {
          unitTypeId: string;
          openingId: string;
          wallId: string;
          unitInstanceId: string;
        };
        setSelectedOpening3D(meta);
        setSelectedInfo({
          label: String(opHit.object.userData.bimLabel ?? 'Esquadria 3D'),
          discipline: 'Esquadrias',
          detail: String(opHit.object.userData.bimDetail ?? 'Arraste ao longo da parede para reposicionar'),
        });
        dragOpeningRef.current = {
          ...meta,
          plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -opHit.point.y),
        };
        lastDragOffsetRef.current = null;
        controls.enabled = false;
        renderer.domElement.style.cursor = 'grabbing';
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      const activeDrag = dragOpeningRef.current;
      if (!activeDrag) return;
      updatePointerFromEvent(ev);
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(activeDrag.plane, dragIntersect)) return;

      const curProj = latestProjectRef.current;
      const ut = curProj.unitTypes.find((u) => u.id === activeDrag.unitTypeId);
      const wall = ut?.walls.find((w) => w.id === activeDrag.wallId);
      const op = ut?.openings.find((o) => o.id === activeDrag.openingId);
      let inst: { x: number; y: number; rotationDeg: number; mirrored: boolean } | undefined;
      for (const fl of curProj.floors) {
        const found = fl.units.find((u) => u.id === activeDrag.unitInstanceId);
        if (found) {
          inst = found;
          break;
        }
      }
      if (!ut || !wall || !op || !inst) return;

      const co = centerOffsetRef.current;
      const dxW = dragIntersect.x + co.x - inst.x;
      const dyW = dragIntersect.z + co.z - inst.y;
      const rad = (inst.rotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const mx = dxW * cos + dyW * sin;
      const ly = -dxW * sin + dyW * cos;
      const lx = inst.mirrored ? ut.width - mx : mx;

      const wxVec = wall.end.x - wall.start.x;
      const wyVec = wall.end.y - wall.start.y;
      const wallLen = Math.hypot(wxVec, wyVec);
      if (wallLen < 0.2) return;

      const t = ((lx - wall.start.x) * wxVec + (ly - wall.start.y) * wyVec) / (wallLen * wallLen);
      const centerAlong = t * wallLen;
      const maxOff = Math.max(0.04, wallLen - op.width - 0.04);
      const rawOff = Math.max(0.04, Math.min(maxOff, centerAlong - op.width / 2));
      const nextOff = round2(Math.round(rawOff / 0.05) * 0.05);

      if (lastDragOffsetRef.current === nextOff || Math.abs(nextOff - op.offsetAlongWall) < 0.01) {
        return;
      }
      lastDragOffsetRef.current = nextOff;
      onUpdateProjectRef.current((prev) => ({
        ...prev,
        unitTypes: prev.unitTypes.map((u) =>
          u.id !== ut.id
            ? u
            : {
                ...u,
                openings: u.openings.map((o) =>
                  o.id === op.id ? { ...o, offsetAlongWall: nextOff } : o,
                ),
              },
        ),
      }));
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (dragOpeningRef.current) {
        dragOpeningRef.current = null;
        controls.enabled = true;
        renderer.domElement.style.cursor = '';
        scheduleRender();
        return;
      }
      const dist = Math.hypot(ev.clientX - pointerDownPos.x, ev.clientY - pointerDownPos.y);
      if (dist > 5) return;
      updatePointerFromEvent(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(modelGroup.children, true);
      const hit = hits.find((h) => h.object.userData?.bimLabel);
      if (selectionBoxRef.current) {
        scene.remove(selectionBoxRef.current);
        selectionBoxRef.current.dispose();
        selectionBoxRef.current = null;
      }
      if (hit) {
        setSelectedInfo({
          label: String(hit.object.userData.bimLabel),
          discipline: String(hit.object.userData.bimDiscipline ?? 'BIM'),
          detail: String(hit.object.userData.bimDetail ?? ''),
        });
        if (!hit.object.userData?.openingDrag) {
          setSelectedOpening3D(null);
        }
        const box = new THREE.BoxHelper(hit.object, 0x3b82f6);
        scene.add(box);
        selectionBoxRef.current = box;
      } else {
        setSelectedInfo(null);
        setSelectedOpening3D(null);
      }
      scheduleRender();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    scheduleRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.removeEventListener('change', handleControlChange);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      if (selectionBoxRef.current) {
        selectionBoxRef.current.dispose();
      }
      envRT.dispose();
      renderer.dispose();
    };
  }, []);

  // Rebuild 3D BIM / Architectural Rendering scene
  useEffect(() => {
    const group = modelGroupRef.current;
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    const sun = sunLightRef.current;
    const hemi = hemiLightRef.current;
    const lightsGroup = interiorLightsGroupRef.current;
    const gridHelper = gridHelperRef.current;
    if (!group || !scene || !renderer || !sun || !hemi || !lightsGroup) return;

    const disposableTextures: THREE.Texture[] = [];

    const disposeGroup = (g: THREE.Group) => {
      while (g.children.length > 0) {
        const child = g.children[0];
        g.remove(child);
        child.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) {
              const std = m as THREE.MeshStandardMaterial;
              if (std.map) std.map.dispose();
              if (std.bumpMap) std.bumpMap.dispose();
              m.dispose();
            }
          }
        });
      }
    };
    disposeGroup(group);
    disposeGroup(lightsGroup);

    const rs = project.renderSettings;
    const isArchRender = (rs.renderQuality ?? 'arquitetonico') === 'arquitetonico';
    const isSoftwareGl = isSoftwareGlRef.current;
    const maxAniso = isSoftwareGl ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());

    if (gridHelper) {
      gridHelper.visible = !isArchRender;
    }

    const clipPlane =
      sectionCutHeight < totalBuildingHeight + 1
        ? new THREE.Plane(new THREE.Vector3(0, -1, 0), sectionCutHeight)
        : null;
    const clippingPlanes = clipPlane ? [clipPlane] : [];

    const isInternalView = activeCameraPreset === 'interna';

    // Atmospheric lighting & sky color
    if (rs.timeOfDay === 'noite') {
      const bg = new THREE.Color(isArchRender ? 0x0b1220 : 0x0b101b);
      scene.background = bg;
      scene.fog = !isSoftwareGl && isArchRender && !isInternalView ? new THREE.FogExp2(0x0b1220, 0.0085) : null;
      scene.environmentIntensity = isInternalView ? 0.35 : 0.14;
      hemi.intensity = isInternalView ? 0.72 : 0.28;
      sun.intensity = 0.4;
      sun.color.setHex(0x93c5fd);
    } else if (rs.timeOfDay === 'entardecer') {
      const bg = new THREE.Color(isArchRender ? 0x43303d : 0x241d26);
      scene.background = bg;
      scene.fog = !isSoftwareGl && isArchRender && !isInternalView ? new THREE.FogExp2(0x43303d, 0.007) : null;
      scene.environmentIntensity = isInternalView ? 0.55 : 0.36;
      hemi.intensity = isInternalView ? 0.95 : 0.55;
      sun.intensity = 1.85;
      sun.color.setHex(0xfdba74);
    } else {
      const bg = new THREE.Color(isArchRender ? 0xbfd7ee : 0x161b22);
      scene.background = bg;
      scene.fog = !isSoftwareGl && isArchRender && !isInternalView ? new THREE.FogExp2(0xbfd7ee, 0.0055) : null;
      scene.environmentIntensity = isInternalView ? 0.75 : 0.48;
      hemi.intensity = isInternalView ? 1.1 : isArchRender ? 0.78 : 0.72;
      sun.intensity = isArchRender ? 2.25 : 2.1;
      sun.color.setHex(0xfffbeb);
    }

    const azRad = (rs.sunAzimuthDeg * Math.PI) / 180;
    const elRad = (Math.max(8, rs.sunElevationDeg) * Math.PI) / 180;
    const sunDist = 38;
    sun.position.set(
      Math.cos(elRad) * Math.sin(azRad) * sunDist,
      Math.sin(elRad) * sunDist,
      Math.cos(elRad) * Math.cos(azRad) * sunDist,
    );

    // Procedural PBR Textures in Architectural Render Mode
    const stuccoTex = isArchRender
      ? rs.wallExteriorFinish
        ? createWallExteriorTextures(rs.wallExteriorFinish, rs.facadeColor || '#EAECEE', maxAniso)
        : createFacadeStuccoTextures(rs.facadeColor || '#EAECEE', maxAniso)
      : null;
    const intWallTex = isArchRender
      ? createWallInteriorTextures(
          rs.wallInteriorFinish ?? 'pintura_fosca',
          rs.interiorWallColor || '#F5F6F8',
          maxAniso,
        )
      : null;
    const floorTex = isArchRender ? createFloorTextures(rs.floorMaterial, maxAniso) : null;
    const roofTex = isArchRender ? createRoofTextures(rs.roofMaterial, maxAniso) : null;
    const ctxTex = isArchRender ? createSiteContextTextures(maxAniso) : null;

    if (stuccoTex) {
      disposableTextures.push(stuccoTex.map);
      if (stuccoTex.bumpMap) disposableTextures.push(stuccoTex.bumpMap);
    }
    if (intWallTex) {
      disposableTextures.push(intWallTex.map);
      if (intWallTex.bumpMap) disposableTextures.push(intWallTex.bumpMap);
    }
    if (floorTex) {
      disposableTextures.push(floorTex.map);
      if (floorTex.bumpMap) disposableTextures.push(floorTex.bumpMap);
    }
    if (roofTex) {
      disposableTextures.push(roofTex.map);
      if (roofTex.bumpMap) disposableTextures.push(roofTex.bumpMap);
    }
    if (ctxTex) {
      disposableTextures.push(ctxTex.sidewalkMap, ctxTex.asphaltMap, ctxTex.grassMap);
    }

    const normSite = normalizeSiteData(project.site);
    const boundarySegs = getLotBoundarySegments(normSite);
    const frontSeg = boundarySegs.find((s) => s.side === 'front') ?? boundarySegs[0];

    // 1. Site surroundings (Earth base, grass lot, sidewalk, curb, asphalt street, boundary walls)
    if (isArchRender) {
      const groundPad = new THREE.Mesh(
        new THREE.PlaneGeometry(140, 140),
        new THREE.MeshStandardMaterial({
          color: rs.timeOfDay === 'noite' ? 0x16201a : 0x3b4d38,
          roughness: 0.95,
          metalness: 0,
        }),
      );
      groundPad.rotation.x = -Math.PI / 2;
      groundPad.position.y = -0.18;
      groundPad.receiveShadow = !isSoftwareGl;
      group.add(groundPad);

      // Street + Sidewalk dynamically aligned to the configured front edge (streetSide)
      if (frontSeg) {
        const streetGroup = new THREE.Group();
        const midX = (frontSeg.a.x + frontSeg.b.x) / 2 - centerOffset.x;
        const midZ = (frontSeg.a.y + frontSeg.b.y) / 2 - centerOffset.z;
        const outX = -frontSeg.inwardNormal.x;
        const outZ = -frontSeg.inwardNormal.y;
        streetGroup.position.set(midX, 0, midZ);
        streetGroup.rotation.y = Math.atan2(outX, outZ);

        const frontLen = Math.max(8, frontSeg.lengthM);

        const sidewalk = new THREE.Mesh(
          new THREE.BoxGeometry(frontLen + 16, 0.12, 2.4),
          new THREE.MeshStandardMaterial({
            map: ctxTex?.sidewalkMap ?? null,
            color: ctxTex ? 0xffffff : 0xb8bdc4,
            roughness: 0.85,
          }),
        );
        sidewalk.position.set(0, -0.06, 1.2);
        sidewalk.receiveShadow = !isSoftwareGl;
        streetGroup.add(sidewalk);

        const curb = new THREE.Mesh(
          new THREE.BoxGeometry(frontLen + 16, 0.14, 0.18),
          new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 }),
        );
        curb.position.set(0, -0.07, 2.45);
        streetGroup.add(curb);

        const street = new THREE.Mesh(
          new THREE.BoxGeometry(frontLen + 28, 0.08, 7.5),
          new THREE.MeshStandardMaterial({
            map: ctxTex?.asphaltMap ?? null,
            color: ctxTex ? 0xffffff : 0x2b2f36,
            roughness: 0.9,
          }),
        );
        street.position.set(0, -0.15, 6.3);
        street.receiveShadow = !isSoftwareGl;
        streetGroup.add(street);

        for (let mx = -frontLen / 2 - 8; mx <= frontLen / 2 + 8; mx += 3.2) {
          const dash = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.015, 0.12),
            new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6 }),
          );
          dash.position.set(mx, -0.105, 6.3);
          streetGroup.add(dash);
        }

        group.add(streetGroup);
      }
    }

    // Site polygon pad
    const siteShape = new THREE.Shape();
    project.site.vertices.forEach((v, idx) => {
      const sx = v.x - centerOffset.x;
      const sz = -(v.y - centerOffset.z);
      if (idx === 0) siteShape.moveTo(sx, sz);
      else siteShape.lineTo(sx, sz);
    });
    siteShape.closePath();

    const siteGeom = new THREE.ExtrudeGeometry(siteShape, { depth: 0.16, bevelEnabled: false });
    siteGeom.rotateX(-Math.PI / 2);
    const siteMat = new THREE.MeshStandardMaterial({
      map: isArchRender && ctxTex ? ctxTex.grassMap : null,
      color: isArchRender ? 0xdbe6d5 : 0x2d3748,
      roughness: 0.92,
      metalness: 0.04,
    });
    const siteMesh = new THREE.Mesh(siteGeom, siteMat);
    siteMesh.position.y = -0.16;
    siteMesh.receiveShadow = !isSoftwareGl;
    siteMesh.userData = {
      bimLabel: `Terreno ${project.site.front}m × ${project.site.leftDepth}m`,
      bimDiscipline: 'Terreno',
      bimDetail: `Área geométrica: ${analyzeSiteGeometry(project.site).calculatedArea} m²`,
    };
    group.add(siteMesh);

    // Perimeter Boundary Walls, Fences & Gates honoring all 4 configured boundaries
    if (isArchRender && layers.arquitetura && project.site.vertices.length >= 3) {
      const muroMat = new THREE.MeshStandardMaterial({
        color: 0xd1d5db,
        roughness: 0.88,
        clippingPlanes,
      });
      const sharedMuroMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.85,
        clippingPlanes,
      });
      const muroCapMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.5,
        metalness: 0.3,
        clippingPlanes,
      });
      const fenceMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.45,
        metalness: 0.55,
        clippingPlanes,
      });
      const gateLeafMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.4,
        metalness: 0.65,
        clippingPlanes,
      });

      for (const seg of boundarySegs) {
        if (seg.lengthM < 0.3) continue;
        const ux = (seg.b.x - seg.a.x) / seg.lengthM;
        const uy = (seg.b.y - seg.a.y) / seg.lengthM;
        const ang = Math.atan2(uy, ux);

        // Enabled gates along this boundary segment
        const gatesOnSeg = normSite.accesses
          .filter((g) => g.enabled && g.side === seg.side)
          .map((g) => {
            const start = Math.max(0, Math.min(seg.lengthM - 0.3, g.offsetM));
            const end = Math.min(seg.lengthM, start + Math.max(0.5, g.widthM));
            return { gate: g, start, end };
          })
          .sort((a, b) => a.start - b.start);

        // Compute solid intervals [t0, t1] skipping gate openings
        const spans: Array<[number, number]> = [];
        let cursor = 0;
        for (const gi of gatesOnSeg) {
          if (gi.start > cursor + 0.05) {
            spans.push([cursor, gi.start]);
          }
          cursor = Math.max(cursor, gi.end);
        }
        if (cursor < seg.lengthM - 0.05) {
          spans.push([cursor, seg.lengthM]);
        }

        const cond = seg.boundary.condition;
        if (cond !== 'aberta') {
          const wallH = Math.max(0.8, seg.boundary.heightM || (cond === 'cerca' ? 1.6 : 1.95));
          for (const [s0, s1] of spans) {
            const spanLen = s1 - s0;
            if (spanLen < 0.15) continue;
            const midT = (s0 + s1) / 2;
            const wx = seg.a.x + ux * midT - centerOffset.x;
            const wz = seg.a.y + uy * midT - centerOffset.z;

            if (cond === 'cerca') {
              const postCount = Math.max(2, Math.floor(spanLen / 2.0) + 1);
              for (let p = 0; p < postCount; p++) {
                const pt = s0 + (spanLen * p) / Math.max(1, postCount - 1);
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallH, 0.08), fenceMat);
                post.position.set(
                  seg.a.x + ux * pt - centerOffset.x,
                  wallH / 2,
                  seg.a.y + uy * pt - centerOffset.z,
                );
                post.rotation.y = -ang;
                group.add(post);
              }
              for (const railRatio of [0.38, 0.82]) {
                const rail = new THREE.Mesh(new THREE.BoxGeometry(spanLen, 0.05, 0.05), fenceMat);
                rail.position.set(wx, wallH * railRatio, wz);
                rail.rotation.y = -ang;
                group.add(rail);
              }
            } else {
              const mat = cond === 'compartilhada' ? sharedMuroMat : muroMat;
              const wallMuro = new THREE.Mesh(new THREE.BoxGeometry(spanLen, wallH, 0.14), mat);
              wallMuro.position.set(wx, wallH / 2, wz);
              wallMuro.rotation.y = -ang;
              wallMuro.castShadow = !isSoftwareGl;
              wallMuro.receiveShadow = !isSoftwareGl;
              wallMuro.userData = {
                bimLabel: `${seg.label} (${cond})`,
                bimDiscipline: 'Terreno',
                bimDetail: `Extensão: ${round2(spanLen)} m · Altura: ${wallH.toFixed(2)} m`,
              };
              group.add(wallMuro);

              const capMuro = new THREE.Mesh(
                new THREE.BoxGeometry(spanLen, 0.05, 0.18),
                muroCapMat,
              );
              capMuro.position.set(wx, wallH + 0.025, wz);
              capMuro.rotation.y = -ang;
              group.add(capMuro);
            }
          }
        }

        // Render gate pillars and gate panel for enabled gates on this edge
        for (const gi of gatesOnSeg) {
          const gw = getGateWorldPosition(normSite, gi.gate);
          if (!gw) continue;
          const gateW = Math.max(0.6, gi.end - gi.start);
          const gateH = gi.gate.type === 'veiculo' ? 2.1 : 1.95;

          const p1x = gw.p1.x - centerOffset.x;
          const p1z = gw.p1.y - centerOffset.z;
          const p2x = gw.p2.x - centerOffset.x;
          const p2z = gw.p2.y - centerOffset.z;

          for (const [px, pz] of [
            [p1x, p1z],
            [p2x, p2z],
          ]) {
            const pillar = new THREE.Mesh(
              new THREE.BoxGeometry(0.18, gateH + 0.1, 0.18),
              muroCapMat,
            );
            pillar.position.set(px, (gateH + 0.1) / 2, pz);
            pillar.castShadow = !isSoftwareGl;
            group.add(pillar);
          }

          const leaf = new THREE.Mesh(new THREE.BoxGeometry(gateW - 0.1, gateH - 0.12, 0.05), gateLeafMat);
          leaf.position.set(gw.center.x - centerOffset.x, (gateH - 0.05) / 2, gw.center.y - centerOffset.z);
          leaf.rotation.y = -ang;
          leaf.userData = {
            bimLabel: gi.gate.label,
            bimDiscipline: 'Acessos',
            bimDetail: `${gi.gate.type === 'veiculo' ? 'Veículos' : 'Pedestres'} · Vão ${gateW.toFixed(2)} m`,
          };
          group.add(leaf);
        }
      }
    }

    // Setback outline (shown in BIM technical mode or when lot has 0 units)
    if (!isArchRender || totalUnitsPlaced === 0) {
      const bBox = analyzeSiteGeometry(project.site).buildableBox;
      if (bBox.width > 0 && bBox.depth > 0) {
        const bx0 = bBox.x - centerOffset.x;
        const bz0 = bBox.y - centerOffset.z;
        const pts = [
          new THREE.Vector3(bx0, 0.03, bz0),
          new THREE.Vector3(bx0 + bBox.width, 0.03, bz0),
          new THREE.Vector3(bx0 + bBox.width, 0.03, bz0 + bBox.depth),
          new THREE.Vector3(bx0, 0.03, bz0 + bBox.depth),
          new THREE.Vector3(bx0, 0.03, bz0),
        ];
        const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xf59e0b });
        group.add(new THREE.Line(lineGeom, lineMat));
      }
    }

    // Shared PBR Materials
    const extWallColor = new THREE.Color(rs.facadeColor || '#EAECEE');
    const intWallColor = new THREE.Color(rs.interiorWallColor || '#F5F6F8');
    const matExtWall = new THREE.MeshStandardMaterial({
      map: stuccoTex?.map ?? null,
      bumpMap: stuccoTex?.bumpMap ?? null,
      bumpScale: rs.wallExteriorFinish === 'tijolinho_aparente' || rs.wallExteriorFinish === 'pedra_madeira' ? 0.032 : 0.016,
      color: stuccoTex ? 0xffffff : extWallColor,
      roughness: rs.wallExteriorFinish === 'cimento_queimado' ? 0.62 : 0.82,
      metalness: 0.04,
      clippingPlanes,
      side: THREE.DoubleSide,
    });
    const matIntWall = new THREE.MeshStandardMaterial({
      map: intWallTex?.map ?? null,
      bumpMap: intWallTex?.bumpMap ?? null,
      bumpScale: 0.014,
      color: intWallTex ? 0xffffff : intWallColor,
      roughness: rs.wallInteriorFinish === 'ceramica_metro' ? 0.34 : 0.82,
      metalness: 0.03,
      clippingPlanes,
      side: THREE.DoubleSide,
    });
    const matDrywall = new THREE.MeshStandardMaterial({
      map: intWallTex?.map ?? null,
      bumpMap: intWallTex?.bumpMap ?? null,
      bumpScale: 0.012,
      color: intWallTex ? 0xf8fafc : 0xeaf0f6,
      roughness: 0.86,
      metalness: 0.02,
      clippingPlanes,
      side: THREE.DoubleSide,
    });
    const matSteelBeam = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.42,
      metalness: 0.72,
      clippingPlanes,
    });
    const matSlab = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.85,
      metalness: 0.05,
      clippingPlanes,
    });
    const matFascia = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.65,
      metalness: 0.15,
      clippingPlanes,
    });
    const matFloorFinish = new THREE.MeshStandardMaterial({
      map: floorTex?.map ?? null,
      bumpMap: floorTex?.bumpMap ?? null,
      bumpScale: 0.012,
      color: floorTex ? 0xffffff : mapFloorColor(rs.floorMaterial),
      roughness: rs.floorMaterial === 'porcelanato_cinza' ? 0.3 : 0.55,
      metalness: 0.06,
      clippingPlanes,
    });
    const fx = getNormalizedSanitaryFixtures(project);
    const metalsHex = getMetalsColorHex(fx.metalsFinish);
    const wareHex = getSanitaryWareHex(fx.sanitaryWareColor);
    const glassTintHex =
      rs.glassType === 'temperado_verde_solar'
        ? 0x7dd3b0
        : rs.glassType === 'temperado_fume'
          ? 0x475569
          : 0xa5d8ff;
    const doorLeafHex =
      rs.interiorDoorMaterial === 'madeira_pintada_branca'
        ? 0xf1f5f9
        : rs.interiorDoorMaterial === 'mdf_melaminico_cinza'
          ? 0x64748b
          : rs.interiorDoorMaterial === 'aluminio_vidro'
            ? 0x334155
            : 0x8f5d38;
    const kitchenCounterHex =
      fx.kitchenSinkType === 'quartzo_cuba_esculpida'
        ? 0xe7e3da
        : fx.kitchenSinkType === 'inox_monobloco'
          ? 0xb8c1cc
          : 0x26292e;

    const matGlass = new THREE.MeshPhysicalMaterial({
      color: glassTintHex,
      transparent: true,
      opacity: rs.glassType === 'temperado_fume' ? 0.52 : 0.36,
      roughness: 0.06,
      metalness: 0.15,
      reflectivity: 0.9,
      clippingPlanes,
    });
    const matFrame = new THREE.MeshStandardMaterial({
      color: mapFrameColor(rs.windowFrameColor),
      roughness: 0.38,
      metalness: 0.58,
      clippingPlanes,
    });
    const matDoor = new THREE.MeshStandardMaterial({
      color: doorLeafHex,
      roughness: rs.interiorDoorMaterial === 'aluminio_vidro' ? 0.35 : 0.58,
      metalness: rs.interiorDoorMaterial === 'aluminio_vidro' ? 0.55 : 0.05,
      clippingPlanes,
    });
    const matHandle = new THREE.MeshStandardMaterial({
      color: metalsHex,
      roughness: fx.metalsFinish === 'preto_fosco' ? 0.45 : 0.25,
      metalness: fx.metalsFinish === 'preto_fosco' ? 0.5 : 0.85,
      clippingPlanes,
    });
    const matWoodDark = new THREE.MeshStandardMaterial({
      color: 0x6b4423,
      roughness: 0.68,
      clippingPlanes,
    });
    const matFabric = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.9,
      clippingPlanes,
    });
    const matBedding = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.85,
      clippingPlanes,
    });
    const matWetFur = new THREE.MeshStandardMaterial({
      color: wareHex,
      roughness: fx.sanitaryWareColor === 'branco_gelo' ? 0.2 : 0.48,
      metalness: 0.08,
      clippingPlanes,
    });
    const matStoneCounter = new THREE.MeshStandardMaterial({
      color: kitchenCounterHex,
      roughness: fx.kitchenSinkType === 'inox_monobloco' ? 0.28 : 0.35,
      metalness: fx.kitchenSinkType === 'inox_monobloco' ? 0.78 : 0.1,
      clippingPlanes,
    });
    const matStainless = new THREE.MeshStandardMaterial({
      color: metalsHex,
      roughness: fx.metalsFinish === 'preto_fosco' ? 0.48 : 0.22,
      metalness: fx.metalsFinish === 'preto_fosco' ? 0.45 : 0.88,
      clippingPlanes,
    });
    const matBlackGlass = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.14,
      metalness: 0.35,
      clippingPlanes,
    });
    const matMirror = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.05,
      metalness: 0.94,
      clippingPlanes,
    });
    const matTileWet = new THREE.MeshStandardMaterial({
      color: 0xeaf0f6,
      roughness: 0.32,
      metalness: 0.05,
      clippingPlanes,
    });
    const matBaseboard = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.55,
      clippingPlanes,
    });
    const matDuvet = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.88,
      clippingPlanes,
    });
    const matSpecial = new THREE.MeshStandardMaterial({
      color: isArchRender ? 0xf8fafc : 0xa855f7,
      emissive: isArchRender ? 0x000000 : 0x7e22ce,
      emissiveIntensity: isArchRender ? 0 : 0.4,
      roughness: 0.35,
      metalness: 0.2,
      clippingPlanes,
    });
    const matStruct = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.7,
      metalness: 0.15,
      clippingPlanes,
    });
    const matElec = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xb45309,
      emissiveIntensity: 0.45,
      roughness: 0.4,
      clippingPlanes,
    });
    const matColdWater = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.35,
      clippingPlanes,
    });
    const matTankBlue = new THREE.MeshStandardMaterial({
      color: 0x1d6fd6,
      roughness: 0.38,
      metalness: 0.08,
      clippingPlanes,
    });
    const matHotWater = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.35,
      clippingPlanes,
    });
    const matDrain = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.45,
      clippingPlanes,
    });

    const mapUnitPt = (
      inst: { x: number; y: number; rotationDeg: number; mirrored: boolean },
      utW: number,
      lx: number,
      ly: number,
    ) => {
      const mx = inst.mirrored ? utW - lx : lx;
      const rad = (inst.rotationDeg * Math.PI) / 180;
      const rx = mx * Math.cos(rad) - ly * Math.sin(rad);
      const ry = mx * Math.sin(rad) + ly * Math.cos(rad);
      return {
        x: inst.x + rx - centerOffset.x,
        z: inst.y + ry - centerOffset.z,
      };
    };

    let minBuildingX = Infinity;
    let maxBuildingX = -Infinity;
    let minBuildingZ = Infinity;
    let maxBuildingZ = -Infinity;
    const computedUnitViews: typeof unitViewsRef.current = [];

    // 2. Floors & Unit Instances
    project.floors.forEach((floor, fIdx) => {
      // In "interna" cutaway mode, show ground floor cleanly open from above so light & interior sightlines shine
      if (isInternalView && fIdx > 0) return;

      const baseY = floor.elevation + fIdx * explodedOffset;

      floor.units.forEach((inst) => {
        const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
        if (!ut) return;

        const c0 = mapUnitPt(inst, ut.width, 0, 0);
        const c1 = mapUnitPt(inst, ut.width, ut.width, ut.depth);
        minBuildingX = Math.min(minBuildingX, c0.x, c1.x);
        maxBuildingX = Math.max(maxBuildingX, c0.x, c1.x);
        minBuildingZ = Math.min(minBuildingZ, c0.z, c1.z);
        maxBuildingZ = Math.max(maxBuildingZ, c0.z, c1.z);

        // Compute clean interior studio camera anchor on floor 0
        if (fIdx === 0) {
          const eyePt = mapUnitPt(inst, ut.width, Math.max(0.55, ut.width - 0.55), Math.max(0.75, ut.depth - 0.55));
          const tgtPt = mapUnitPt(inst, ut.width, ut.width * 0.38, 1.45);
          const eyeY = baseY + floor.slabThickness + 1.52;
          const tgtY = baseY + floor.slabThickness + 0.92;
          computedUnitViews.push({
            id: inst.id,
            unitNumber: inst.unitNumber,
            utCode: ut.code,
            eye: new THREE.Vector3(eyePt.x, eyeY, eyePt.z),
            target: new THREE.Vector3(tgtPt.x, tgtY, tgtPt.z),
          });
        }

        // Floor slab + architectural floor finish + wet-room ceramic + baseboards
        if (layers.arquitetura) {
          const slabCenter = mapUnitPt(inst, ut.width, ut.width / 2, ut.depth / 2);
          const slabGeom = new THREE.BoxGeometry(ut.width, floor.slabThickness, ut.depth);
          const slabMesh = new THREE.Mesh(slabGeom, fIdx === 0 ? matFascia : matSlab);
          slabMesh.position.set(slabCenter.x, baseY + floor.slabThickness / 2, slabCenter.z);
          slabMesh.rotation.y = -(inst.rotationDeg * Math.PI) / 180;
          slabMesh.receiveShadow = !isSoftwareGl;
          slabMesh.castShadow = !isSoftwareGl;
          slabMesh.userData = {
            bimLabel: `Unidade ${inst.unitNumber} (${ut.code})`,
            bimDiscipline: 'Arquitetura',
            bimDetail: `${ut.name} · ${round2(ut.width * ut.depth)} m² · ${floor.name}`,
          };
          group.add(slabMesh);

          const finishGeom = new THREE.BoxGeometry(ut.width - 0.08, 0.025, ut.depth - 0.08);
          const finishMesh = new THREE.Mesh(finishGeom, matFloorFinish);
          finishMesh.position.set(slabCenter.x, baseY + floor.slabThickness + 0.012, slabCenter.z);
          finishMesh.rotation.y = -(inst.rotationDeg * Math.PI) / 180;
          finishMesh.receiveShadow = !isSoftwareGl;
          group.add(finishMesh);

          // Wet zone ceramic floor inlay (BWC + Cozinha) & baseboard trim
          if (isArchRender) {
            for (const rm of ut.rooms) {
              if (rm.category === 'banheiro' || rm.category === 'cozinha') {
                const rc = mapUnitPt(inst, ut.width, rm.x + rm.width / 2, rm.y + rm.depth / 2);
                const wetFloor = new THREE.Mesh(
                  new THREE.BoxGeometry(Math.max(0.2, rm.width - 0.06), 0.028, Math.max(0.2, rm.depth - 0.06)),
                  matTileWet,
                );
                wetFloor.position.set(rc.x, baseY + floor.slabThickness + 0.014, rc.z);
                wetFloor.rotation.y = -(inst.rotationDeg * Math.PI) / 180;
                wetFloor.receiveShadow = !isSoftwareGl;
                group.add(wetFloor);
              }
            }
          }

          // Interior warm architectural lights (always lit in internal view or when toggled)
          if (
            (isInternalView || rs.artificialLightsOn || rs.timeOfDay === 'noite') &&
            lightsGroup.children.length < 18
          ) {
            const pLight = new THREE.PointLight(
              0xffe7c2,
              isInternalView ? 4.2 : rs.timeOfDay === 'noite' ? 3.2 : 1.8,
              8.5,
              1.4,
            );
            pLight.position.set(
              slabCenter.x,
              baseY + floor.slabThickness + ut.ceilingHeight - 0.25,
              slabCenter.z,
            );
            lightsGroup.add(pLight);
          }

          // Walls with REAL extruded window/door cutouts
          const openingsByWall = new Map<string, Opening[]>();
          for (const op of ut.openings) {
            const arr = openingsByWall.get(op.wallId) ?? [];
            arr.push(op);
            openingsByWall.set(op.wallId, arr);
          }

          const hasMezUt = !!(ut.hasMezzanine && ut.mezzanine?.enabled && ut.ceilingHeight >= 3.0);
          const mezCfgUt = ut.mezzanine;

          for (const w of ut.walls as Wall[]) {
            const len = getWallLength(w);
            if (len < 0.05) continue;
            const pA = mapUnitPt(inst, ut.width, w.start.x, w.start.y);
            const pB = mapUnitPt(inst, ut.width, w.end.x, w.end.y);
            const mx = (pA.x + pB.x) / 2;
            const mz = (pA.z + pB.z) / 2;
            const angle = Math.atan2(pB.z - pA.z, pB.x - pA.x);

            let effectiveWallH = w.height;
            if (!w.isExternal && hasMezUt && mezCfgUt) {
              const wMinX = Math.min(w.start.x, w.end.x);
              const wMaxX = Math.max(w.start.x, w.end.x);
              const wMinY = Math.min(w.start.y, w.end.y);
              const wMaxY = Math.max(w.start.y, w.end.y);
              const touchesMez =
                wMaxX >= mezCfgUt.x - 0.15 &&
                wMinX <= mezCfgUt.x + mezCfgUt.width + 0.15 &&
                wMaxY >= mezCfgUt.y - 0.15 &&
                wMinY <= mezCfgUt.y + mezCfgUt.depth + 0.15;
              if (touchesMez || w.code.includes('BWC')) {
                effectiveWallH = Math.min(w.height, mezCfgUt.elevationM);
              }
            }

            const wallOps = openingsByWall.get(w.id) ?? [];
            const wallGeom = isArchRender
              ? buildWallWithOpeningsGeometry(len, effectiveWallH, w.thickness, wallOps)
              : (() => {
                  const g = new THREE.BoxGeometry(len, effectiveWallH, w.thickness);
                  g.translate(0, effectiveWallH / 2, 0);
                  return g;
                })();

            const isDrywall =
              !w.isExternal && w.material.toLowerCase().includes('drywall');
            const wallMesh = new THREE.Mesh(
              wallGeom,
              w.isExternal ? matExtWall : isDrywall ? matDrywall : matIntWall,
            );
            wallMesh.position.set(mx, baseY + floor.slabThickness, mz);
            wallMesh.rotation.y = -angle;
            wallMesh.castShadow = !isSoftwareGl && !isInternalView;
            wallMesh.receiveShadow = !isSoftwareGl;
            wallMesh.userData = {
              bimLabel: `Parede ${w.code} — Unid. ${inst.unitNumber}`,
              bimDiscipline: 'Arquitetura',
              bimDetail: `${w.isExternal ? 'Externa' : isDrywall ? 'Interna Drywall' : 'Interna Alvenaria'} · e=${Math.round(w.thickness * 100)}cm · ${w.material}`,
            };
            group.add(wallMesh);

            // Baseboard trim (rodapé) along interior face of walls
            if (isArchRender && wallOps.length === 0) {
              const bbMesh = new THREE.Mesh(
                new THREE.BoxGeometry(Math.max(0.1, len - 0.06), 0.08, w.thickness + 0.02),
                matBaseboard,
              );
              bbMesh.position.set(mx, baseY + floor.slabThickness + 0.04, mz);
              bbMesh.rotation.y = -angle;
              group.add(bbMesh);
            }
          }

          // Detailed Doors, Windows & Basculante Vitrôs Assemblies (Interactive 3D selection & drag-along-wall)
          const proxyMat = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
          });
          for (const op of ut.openings) {
            const wall = ut.walls.find((w) => w.id === op.wallId);
            if (!wall) continue;
            const pos = getOpeningWorldPosition(wall, op);
            const wp = mapUnitPt(inst, ut.width, pos.center.x, pos.center.y);
            const wallAngle = getWallAngleRad(wall);
            const totalAngle = wallAngle + (inst.rotationDeg * Math.PI) / 180;
            const rotY = inst.mirrored ? totalAngle : -totalAngle;
            const baseOpY = baseY + floor.slabThickness + op.sillHeight;
            const opDragData = {
              unitTypeId: ut.id,
              openingId: op.id,
              wallId: wall.id,
              unitInstanceId: inst.id,
            };
            const isSel3D =
              selectedOpening3D?.openingId === op.id &&
              selectedOpening3D?.unitInstanceId === inst.id;

            if (op.type === 'janela') {
              const isVitro =
                op.openingKind?.startsWith('vitro_') ||
                op.subtype.toLowerCase().includes('basculante') ||
                op.subtype.toLowerCase().includes('vitr');
              const jGroup = new THREE.Group();
              jGroup.position.set(wp.x, baseOpY + op.height / 2, wp.z);
              jGroup.rotation.y = rotY;

              const glassPane = new THREE.Mesh(
                new THREE.BoxGeometry(op.width - 0.06, op.height - 0.06, 0.025),
                matGlass,
              );
              if (isVitro) {
                glassPane.rotation.x = 0.24;
              }
              glassPane.userData = {
                bimLabel: `${op.code} (${op.subtype}) — Unid. ${inst.unitNumber}`,
                bimDiscipline: 'Esquadrias',
                bimDetail: `${op.width.toFixed(2)}×${op.height.toFixed(2)}m · Peitoril ${op.sillHeight.toFixed(2)}m · ${op.material} · Arraste no 3D`,
                openingDrag: opDragData,
              };
              jGroup.add(glassPane);

              const hitProxy = new THREE.Mesh(
                new THREE.BoxGeometry(op.width + 0.08, op.height + 0.08, wall.thickness + 0.14),
                proxyMat,
              );
              hitProxy.userData = glassPane.userData;
              jGroup.add(hitProxy);

              const frameD = wall.thickness + 0.03;
              const sill = new THREE.Mesh(new THREE.BoxGeometry(op.width + 0.06, 0.045, frameD + 0.04), matFrame);
              sill.position.y = -op.height / 2;
              const head = new THREE.Mesh(new THREE.BoxGeometry(op.width + 0.02, 0.04, frameD), matFrame);
              head.position.y = op.height / 2;
              const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.04, op.height, frameD), matFrame);
              jambL.position.x = -op.width / 2 + 0.02;
              const jambR = new THREE.Mesh(new THREE.BoxGeometry(0.04, op.height, frameD), matFrame);
              jambR.position.x = op.width / 2 - 0.02;
              const bar = isVitro
                ? new THREE.Mesh(new THREE.BoxGeometry(op.width - 0.04, 0.03, 0.045), matFrame)
                : new THREE.Mesh(new THREE.BoxGeometry(0.035, op.height - 0.04, 0.045), matFrame);
              jGroup.add(sill, head, jambL, jambR, bar);
              if (isSel3D) {
                jGroup.add(new THREE.BoxHelper(hitProxy, 0x3b82f6));
              }
              group.add(jGroup);
            } else {
              const dGroup = new THREE.Group();
              dGroup.position.set(wp.x, baseOpY + op.height / 2, wp.z);
              dGroup.rotation.y = rotY;

              const leaf = new THREE.Mesh(
                new THREE.BoxGeometry(op.width - 0.06, op.height - 0.04, 0.04),
                matDoor,
              );
              leaf.castShadow = !isSoftwareGl;
              leaf.userData = {
                bimLabel: `${op.code} (${op.subtype}) — Unid. ${inst.unitNumber}`,
                bimDiscipline: 'Esquadrias',
                bimDetail: `${op.width.toFixed(2)}×${op.height.toFixed(2)}m · ${op.material} · Arraste no 3D`,
                openingDrag: opDragData,
              };
              dGroup.add(leaf);

              const hitProxy = new THREE.Mesh(
                new THREE.BoxGeometry(op.width + 0.08, op.height + 0.06, wall.thickness + 0.14),
                proxyMat,
              );
              hitProxy.userData = leaf.userData;
              dGroup.add(hitProxy);

              const frameD = wall.thickness + 0.03;
              const topJamb = new THREE.Mesh(new THREE.BoxGeometry(op.width + 0.04, 0.045, frameD), matFrame);
              topJamb.position.y = op.height / 2;
              const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.045, op.height, frameD), matFrame);
              jambL.position.x = -op.width / 2 + 0.02;
              const jambR = new THREE.Mesh(new THREE.BoxGeometry(0.045, op.height, frameD), matFrame);
              jambR.position.x = op.width / 2 - 0.02;
              const handle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.09), matHandle);
              handle.position.set(op.width / 2 - 0.14, -0.05, 0);
              dGroup.add(topJamb, jambL, jambR, handle);
              if (isSel3D) {
                dGroup.add(new THREE.BoxHelper(hitProxy, 0x3b82f6));
              }
              group.add(dGroup);
            }
          }
        }

        // Conditional Mezzanine Deck, Support Columns & Guardrail (never counted as a floor)
        if (
          layers.arquitetura &&
          ut.hasMezzanine &&
          ut.mezzanine?.enabled &&
          ut.ceilingHeight >= 3.0
        ) {
          const mez = ut.mezzanine;
          const mezCenter = mapUnitPt(inst, ut.width, mez.x + mez.width / 2, mez.y + mez.depth / 2);
          const mezDeckY = baseY + floor.slabThickness + mez.elevationM;
          const isWoodMez = mez.structureType === 'madeira_estrutural';
          const deckMat =
            mez.structureType === 'concreto_armado'
              ? matSlab
              : mez.structureType === 'steel_deck'
                ? matSteelBeam
                : matWoodDark;
          const beamMat = isWoodMez ? matWoodDark : mez.structureType === 'concreto_armado' ? matSlab : matSteelBeam;

          const deckMesh = new THREE.Mesh(
            new THREE.BoxGeometry(mez.width, mez.slabThicknessM, mez.depth),
            deckMat,
          );
          deckMesh.position.set(mezCenter.x, mezDeckY + mez.slabThicknessM / 2, mezCenter.z);
          deckMesh.rotation.y = -(inst.rotationDeg * Math.PI) / 180;
          deckMesh.castShadow = !isSoftwareGl;
          deckMesh.receiveShadow = !isSoftwareGl;
          deckMesh.userData = {
            bimLabel: `Mezanino +${mez.elevationM.toFixed(2)}m — Unid. ${inst.unitNumber}`,
            bimDiscipline: 'Arquitetura',
            bimDetail: `${mez.width.toFixed(2)}×${mez.depth.toFixed(2)}m (${Math.round((mez.coverageRatio || 0) * 100)}%) · Estrutura ${mez.structureType.replace(/_/g, ' ')}`,
          };
          group.add(deckMesh);

          // Forro/laje fechando o teto do banheiro térreo quando o mezanino é compacto (ex. 10%–20%)
          const bathRoom = ut.rooms.find((r) => r.category === 'banheiro');
          if (bathRoom) {
            const bc = mapUnitPt(
              inst,
              ut.width,
              bathRoom.x + bathRoom.width / 2,
              bathRoom.y + bathRoom.depth / 2,
            );
            const bathCeil = new THREE.Mesh(
              new THREE.BoxGeometry(bathRoom.width + 0.08, 0.06, bathRoom.depth + 0.08),
              matDrywall,
            );
            bathCeil.position.set(bc.x, mezDeckY - 0.03, bc.z);
            bathCeil.rotation.y = -(inst.rotationDeg * Math.PI) / 180;
            bathCeil.receiveShadow = !isSoftwareGl;
            group.add(bathCeil);
          }

          // Vigas estruturais principais (bordas) + barrotes/perfis secundários sob o deck
          const beamH = isWoodMez ? 0.14 : 0.12;
          const beamW = isWoodMez ? 0.08 : 0.06;
          for (const edgeY of [mez.y + beamW / 2, mez.y + mez.depth - beamW / 2]) {
            const bp = mapUnitPt(inst, ut.width, mez.x + mez.width / 2, edgeY);
            const mainBeam = new THREE.Mesh(new THREE.BoxGeometry(mez.width, beamH, beamW), beamMat);
            mainBeam.position.set(bp.x, mezDeckY - beamH / 2, bp.z);
            mainBeam.rotation.y = -(inst.rotationDeg * Math.PI) / 180;
            mainBeam.castShadow = !isSoftwareGl;
            group.add(mainBeam);
          }
          const joistCount = Math.max(2, Math.round(mez.width / 0.6));
          for (let j = 0; j <= joistCount; j++) {
            const lx = mez.x + beamW / 2 + ((mez.width - beamW) * j) / joistCount;
            const jp = mapUnitPt(inst, ut.width, lx, mez.y + mez.depth / 2);
            const joist = new THREE.Mesh(
              new THREE.BoxGeometry(beamW * 0.75, beamH * 0.85, mez.depth - beamW * 1.5),
              beamMat,
            );
            joist.position.set(jp.x, mezDeckY - (beamH * 0.85) / 2, jp.z);
            joist.rotation.y = -(inst.rotationDeg * Math.PI) / 180;
            group.add(joist);
          }

          // Corner support columns
          const colCorners = [
            { lx: mez.x + 0.06, ly: mez.y + 0.06 },
            { lx: mez.x + mez.width - 0.06, ly: mez.y + 0.06 },
            { lx: mez.x + 0.06, ly: mez.y + mez.depth - 0.06 },
            { lx: mez.x + mez.width - 0.06, ly: mez.y + mez.depth - 0.06 },
          ];
          for (const corner of colCorners) {
            const cp = mapUnitPt(inst, ut.width, corner.lx, corner.ly);
            const colMesh = new THREE.Mesh(
              new THREE.BoxGeometry(0.08, mez.elevationM, 0.08),
              beamMat,
            );
            colMesh.position.set(cp.x, baseY + floor.slabThickness + mez.elevationM / 2, cp.z);
            colMesh.rotation.y = -(inst.rotationDeg * Math.PI) / 180;
            colMesh.castShadow = !isSoftwareGl;
            group.add(colMesh);
          }

          // Guardrail (guarda-corpo 1,05m) nas bordas abertas, respeitando o vão de chegada da escada
          const railH = mez.guardrailHeightM || 1.05;
          const stairItem = ut.furniture.find((f) => f.category === 'escada');
          const addRailSegment = (lx0: number, ly0: number, lx1: number, ly1: number) => {
            const p0 = mapUnitPt(inst, ut.width, lx0, ly0);
            const p1 = mapUnitPt(inst, ut.width, lx1, ly1);
            const rLen = Math.hypot(p1.x - p0.x, p1.z - p0.z);
            if (rLen < 0.2) return;
            const rAng = Math.atan2(p1.z - p0.z, p1.x - p0.x);
            const topBar = new THREE.Mesh(
              new THREE.BoxGeometry(rLen, 0.04, 0.04),
              matSteelBeam,
            );
            topBar.position.set((p0.x + p1.x) / 2, mezDeckY + mez.slabThicknessM + railH, (p0.z + p1.z) / 2);
            topBar.rotation.y = -rAng;
            const midBar = new THREE.Mesh(
              new THREE.BoxGeometry(rLen, 0.025, 0.025),
              matSteelBeam,
            );
            midBar.position.set((p0.x + p1.x) / 2, mezDeckY + mez.slabThicknessM + railH * 0.52, (p0.z + p1.z) / 2);
            midBar.rotation.y = -rAng;
            group.add(topBar, midBar);

            const balusterCount = Math.max(2, Math.round(rLen / 0.65) + 1);
            for (let b = 0; b < balusterCount; b++) {
              const t = b / Math.max(1, balusterCount - 1);
              const bx = p0.x + (p1.x - p0.x) * t;
              const bz = p0.z + (p1.z - p0.z) * t;
              const post = new THREE.Mesh(
                new THREE.BoxGeometry(0.03, railH, 0.03),
                matSteelBeam,
              );
              post.position.set(bx, mezDeckY + mez.slabThicknessM + railH / 2, bz);
              group.add(post);
            }
          };

          if (mez.y + mez.depth < ut.depth - 0.55) {
            const edgeY = mez.y + mez.depth - 0.03;
            const startX = mez.x + 0.05;
            const endX = mez.x + mez.width - 0.05;
            if (
              stairItem &&
              stairItem.y <= mez.y + mez.depth + 0.45 &&
              stairItem.y + stairItem.depth >= mez.y + mez.depth - 0.45
            ) {
              const gStart = Math.max(startX, stairItem.x - 0.06);
              const gEnd = Math.min(endX, stairItem.x + stairItem.width + 0.06);
              if (gStart - startX >= 0.2) addRailSegment(startX, edgeY, gStart, edgeY);
              if (endX - gEnd >= 0.2) addRailSegment(gEnd, edgeY, endX, edgeY);
            } else {
              addRailSegment(startX, edgeY, endX, edgeY);
            }
          }
          if (mez.x + mez.width < ut.width - 0.55) {
            const edgeX = mez.x + mez.width - 0.03;
            addRailSegment(edgeX, mez.y + 0.05, edgeX, mez.y + mez.depth - 0.05);
          }
          if (mez.x > 0.55) {
            const edgeX = mez.x + 0.03;
            addRailSegment(edgeX, mez.y + 0.05, edgeX, mez.y + mez.depth - 0.05);
          }
        }

        // Multi-part Architectural Furniture (including elevated mezzanine furniture & 3D Blondel staircase)
        if (layers.mobiliario) {
          const hasUpperBed = !!(
            ut.hasMezzanine &&
            ut.mezzanine?.enabled &&
            ut.furniture.some((bf) => bf.category === 'cama' && (bf.elevationM ?? 0) >= 1.2)
          );
          for (const f of ut.furniture) {
            if (
              hasUpperBed &&
              (f.category === 'cama' || f.category === 'mesa_cabeceira') &&
              (f.elevationM ?? 0) < 0.5
            ) {
              continue;
            }
            const fRot = ((f.rotationDeg % 360) + 360) % 360;
            const fRad = (fRot * Math.PI) / 180;
            const fw = f.width * Math.abs(Math.cos(fRad)) + f.depth * Math.abs(Math.sin(fRad));
            const fd = f.width * Math.abs(Math.sin(fRad)) + f.depth * Math.abs(Math.cos(fRad));
            const fc = mapUnitPt(inst, ut.width, f.x + fw / 2, f.y + fd / 2);
            const effectiveFurnRot = inst.mirrored ? -f.rotationDeg : f.rotationDeg;
            const rotY = -((inst.rotationDeg + effectiveFurnRot) * Math.PI) / 180;
            const fy0 = baseY + floor.slabThickness + (f.elevationM ?? 0);
            const furGroup = new THREE.Group();
            furGroup.position.set(fc.x, fy0, fc.z);
            furGroup.rotation.y = rotY;

            const addPart = (
              w: number,
              h: number,
              d: number,
              yPos: number,
              mat: THREE.Material,
              xOff = 0,
              zOff = 0,
              tagMain = false,
            ) => {
              const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
              m.position.set(xOff, yPos, zOff);
              m.castShadow = !isSoftwareGl;
              m.receiveShadow = !isSoftwareGl;
              if (tagMain) {
                m.userData = {
                  bimLabel: `${f.name} — Unid. ${inst.unitNumber}`,
                  bimDiscipline: 'Mobiliário',
                  bimDetail: `${f.width.toFixed(2)}×${f.depth.toFixed(2)}×${f.height.toFixed(2)} m${f.elevationM ? ` · Cota +${f.elevationM.toFixed(2)}m` : ''}`,
                };
              }
              furGroup.add(m);
            };

            if (f.category === 'escada') {
              const steps = Math.max(4, f.stairSpec?.steps ?? 9);
              const totalRise = Math.max(1.8, f.height);
              const riser = totalRise / steps;
              if (f.stairSpec?.layout === 'caracol_compacta') {
                const pole = new THREE.Mesh(
                  new THREE.CylinderGeometry(0.05, 0.05, totalRise + 0.9, 10),
                  matSteelBeam,
                );
                pole.position.set(0, (totalRise + 0.9) / 2, 0);
                pole.userData = {
                  bimLabel: `${f.name} — Unid. ${inst.unitNumber}`,
                  bimDiscipline: 'Arquitetura',
                  bimDetail: `${steps} degraus helicoidais · Pé-direito ${(f.stairSpec?.blondelSumM ?? 0.63).toFixed(2)}m`,
                };
                furGroup.add(pole);
                const rad = Math.min(f.width, f.depth) * 0.48;
                for (let s = 0; s < steps; s++) {
                  const ang = (s / steps) * Math.PI * 1.65;
                  const tread = new THREE.Mesh(
                    new THREE.BoxGeometry(rad, 0.04, 0.24),
                    matWoodDark,
                  );
                  tread.position.set(
                    Math.cos(ang) * (rad * 0.5),
                    riser * (s + 1),
                    Math.sin(ang) * (rad * 0.5),
                  );
                  tread.rotation.y = -ang;
                  tread.castShadow = !isSoftwareGl;
                  furGroup.add(tread);
                }
              } else {
                const runDepth = f.depth / steps;
                for (let s = 0; s < steps; s++) {
                  const stepZ = f.depth / 2 - runDepth * (s + 0.5);
                  const stepY = riser * (s + 1);
                  addPart(
                    f.width - 0.04,
                    0.045,
                    Math.max(0.22, runDepth * 1.05),
                    stepY,
                    matWoodDark,
                    0,
                    stepZ,
                    s === 0,
                  );
                }
                // Stringer beams & handrail posts
                const strLen = Math.hypot(f.depth, totalRise);
                const strAng = Math.atan2(totalRise, f.depth);
                for (const sideX of [-f.width / 2 + 0.03, f.width / 2 - 0.03]) {
                  const stringer = new THREE.Mesh(
                    new THREE.BoxGeometry(0.04, 0.1, strLen),
                    matSteelBeam,
                  );
                  stringer.position.set(sideX, totalRise / 2, 0);
                  stringer.rotation.x = strAng;
                  furGroup.add(stringer);
                }
                const railPostA = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 0.03), matSteelBeam);
                railPostA.position.set(-f.width / 2 + 0.03, 0.45, f.depth / 2 - 0.08);
                const railPostB = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 0.03), matSteelBeam);
                railPostB.position.set(-f.width / 2 + 0.03, totalRise + 0.45, -f.depth / 2 + 0.08);
                const handRail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, strLen), matSteelBeam);
                handRail.position.set(-f.width / 2 + 0.03, totalRise / 2 + 0.9, 0);
                handRail.rotation.x = strAng;
                furGroup.add(railPostA, railPostB, handRail);
              }
            } else if (isArchRender && f.category === 'cama') {
              // Orient headboard toward wall end only if user kept rotation at 0° in lower studio zone; otherwise strictly honor rotationDeg
              const dir = fRot === 0 && f.y + f.depth > ut.depth * 0.55 ? 1 : -1;
              addPart(f.width, 0.16, f.depth, 0.1, matWoodDark, 0, 0, true);
              addPart(f.width - 0.08, 0.22, f.depth - 0.08, 0.29, matBedding);
              addPart(f.width - 0.04, 0.05, f.depth * 0.62, 0.41, matDuvet, 0, -dir * f.depth * 0.17);
              addPart(f.width, Math.max(0.85, f.height), 0.08, Math.max(0.45, f.height / 2), matWoodDark, 0, dir * (f.depth / 2 - 0.04));
              addPart(f.width * 0.38, 0.1, 0.34, 0.45, matBedding, -f.width * 0.22, dir * (f.depth / 2 - 0.26));
              addPart(f.width * 0.38, 0.1, 0.34, 0.45, matBedding, f.width * 0.22, dir * (f.depth / 2 - 0.26));
            } else if (isArchRender && f.category === 'mesa_cabeceira') {
              addPart(f.width, f.height, f.depth, f.height / 2, matWoodDark, 0, 0, true);
              addPart(0.16, 0.18, 0.16, f.height + 0.14, matBedding);
              addPart(0.06, 0.06, 0.06, f.height + 0.03, matHandle);
            } else if (isArchRender && f.category === 'guarda_roupa') {
              addPart(f.width, f.height, f.depth - 0.03, f.height / 2, matWoodDark, 0, -0.015, true);
              addPart(f.width * 0.48, f.height - 0.08, 0.025, f.height / 2, matBedding, -f.width * 0.24, f.depth / 2 - 0.015);
              addPart(f.width * 0.48, f.height - 0.08, 0.025, f.height / 2, matFabric, f.width * 0.24, f.depth / 2 - 0.01);
              addPart(0.02, 0.35, 0.02, 1.05, matHandle, -0.04, f.depth / 2 + 0.01);
              addPart(0.02, 0.35, 0.02, 1.05, matHandle, 0.04, f.depth / 2 + 0.01);
            } else if (isArchRender && f.category === 'rack_tv') {
              addPart(f.width, f.height, f.depth, f.height / 2, matWoodDark, 0, 0, true);
              addPart(f.width * 0.45, f.height * 0.4, 0.02, f.height * 0.4, matBedding, -f.width * 0.24, f.depth / 2 + 0.01);
              addPart(f.width * 0.45, f.height * 0.4, 0.02, f.height * 0.4, matBedding, f.width * 0.24, f.depth / 2 + 0.01);
            } else if (isArchRender && f.category === 'tv') {
              const tvY = Math.max(0.85, f.height);
              addPart(f.width, 0.56, 0.04, tvY, matBlackGlass, 0, 0, true);
              addPart(0.28, 0.03, 0.16, tvY - 0.31, matHandle);
            } else if (isArchRender && f.category === 'mesa') {
              addPart(f.width, 0.04, f.depth, f.height - 0.02, matWoodDark, 0, 0, true);
              addPart(0.04, f.height - 0.04, 0.04, (f.height - 0.04) / 2, matFrame, -f.width / 2 + 0.05, -f.depth / 2 + 0.05);
              addPart(0.04, f.height - 0.04, 0.04, (f.height - 0.04) / 2, matFrame, f.width / 2 - 0.05, -f.depth / 2 + 0.05);
              addPart(0.04, f.height - 0.04, 0.04, (f.height - 0.04) / 2, matFrame, -f.width / 2 + 0.05, f.depth / 2 - 0.05);
              addPart(0.04, f.height - 0.04, 0.04, (f.height - 0.04) / 2, matFrame, f.width / 2 - 0.05, f.depth / 2 - 0.05);
            } else if (isArchRender && f.category === 'cadeira') {
              addPart(f.width * 0.9, 0.05, f.depth * 0.85, 0.45, matFabric, 0, 0, true);
              addPart(f.width * 0.85, 0.4, 0.05, 0.68, matFabric, 0, f.depth / 2 - 0.04);
              addPart(0.04, 0.44, 0.04, 0.22, matFrame, -f.width * 0.35, -f.depth * 0.32);
              addPart(0.04, 0.44, 0.04, 0.22, matFrame, f.width * 0.35, -f.depth * 0.32);
              addPart(0.04, 0.44, 0.04, 0.22, matFrame, -f.width * 0.35, f.depth * 0.32);
              addPart(0.04, 0.44, 0.04, 0.22, matFrame, f.width * 0.35, f.depth * 0.32);
            } else if (isArchRender && f.category === 'sofa') {
              addPart(f.width, 0.36, f.depth, 0.18, matFabric, 0, 0, true);
              addPart(f.width, 0.42, 0.18, 0.52, matFabric, 0, -f.depth / 2 + 0.09);
              addPart(0.16, 0.38, f.depth, 0.36, matFabric, -f.width / 2 + 0.08, 0);
              addPart(0.16, 0.38, f.depth, 0.36, matFabric, f.width / 2 - 0.08, 0);
            } else if (isArchRender && f.category === 'bancada') {
              addPart(f.width - 0.04, f.height - 0.06, f.depth - 0.04, (f.height - 0.06) / 2, matWoodDark, 0, 0, true);
              addPart(f.width, 0.05, f.depth, f.height - 0.025, matStoneCounter);
              addPart(0.46, 0.025, 0.36, f.height + 0.008, matStainless, -f.width * 0.22, 0);
              addPart(0.03, 0.24, 0.03, f.height + 0.12, matStainless, -f.width * 0.22, -f.depth * 0.32);
              addPart(0.03, 0.03, 0.14, f.height + 0.23, matStainless, -f.width * 0.22, -f.depth * 0.24);
            } else if (isArchRender && f.category === 'cooktop') {
              addPart(f.width, 0.03, f.depth, 0.915, matBlackGlass, 0, 0, true);
              addPart(0.14, 0.015, 0.14, 0.935, matFrame, -f.width * 0.24, -f.depth * 0.2);
              addPart(0.14, 0.015, 0.14, 0.935, matFrame, f.width * 0.24, -f.depth * 0.2);
            } else if (isArchRender && f.category === 'geladeira') {
              addPart(f.width, f.height, f.depth, f.height / 2, matStainless, 0, 0, true);
              addPart(0.02, f.height * 0.45, 0.03, f.height * 0.65, matFrame, -f.width * 0.35, f.depth / 2 + 0.02);
              addPart(0.02, f.height * 0.22, 0.03, f.height * 0.2, matFrame, -f.width * 0.35, f.depth / 2 + 0.02);
            } else if (isArchRender && f.category === 'vaso_sanitario') {
              const bowlZ = fx.toiletType === 'suspensa_embutida' ? 0.1 : 0.05;
              const bowlY = fx.toiletType === 'suspensa_embutida' ? 0.25 : 0.19;
              addPart(f.width * 0.85, 0.34, f.depth * 0.72, bowlY, matWetFur, 0, bowlZ, true);
              if (
                fx.toiletType === 'caixa_acoplada_dual' ||
                fx.toiletType === 'caixa_acoplada_monobloco'
              ) {
                addPart(f.width * 0.9, 0.36, 0.16, 0.56, matWetFur, 0, -f.depth / 2 + 0.09);
                addPart(0.06, 0.02, 0.04, 0.75, matStainless, 0, -f.depth / 2 + 0.09);
              } else {
                // Wall flush plate (Hydra / built-in concealed tank)
                addPart(0.16, 0.11, 0.02, 1.05, matStainless, 0, -f.depth / 2 - 0.01);
              }
            } else if (isArchRender && f.category === 'lavatorio') {
              if (fx.washbasinType === 'lavatorio_coluna_suspensa') {
                addPart(f.width * 0.88, 0.14, f.depth * 0.84, 0.78, matWetFur, 0, 0, true);
              } else {
                addPart(f.width * 0.9, 0.55, f.depth * 0.88, 0.52, matWoodDark, 0, 0, true);
                addPart(f.width, 0.05, f.depth, 0.82, matStoneCounter);
                if (fx.washbasinType === 'cuba_apoio_granito') {
                  addPart(f.width * 0.68, 0.12, f.depth * 0.66, 0.9, matWetFur);
                } else {
                  addPart(f.width * 0.65, 0.03, f.depth * 0.6, 0.85, matWetFur);
                }
              }
              addPart(0.03, 0.2, 0.03, 0.96, matStainless, 0, -f.depth * 0.32);
            } else if (isArchRender && f.category === 'espelho') {
              addPart(f.width, f.height, 0.03, 1.45, matMirror, 0, 0, true);
            } else if (isArchRender && f.category === 'chuveiro') {
              if (fx.showerType === 'ducha_teto_monocomando') {
                addPart(0.03, 0.26, 0.03, 2.28, matStainless, 0, 0.18, true);
                addPart(0.24, 0.025, 0.24, 2.15, matStainless, 0, 0.18);
              } else if (
                fx.showerType === 'eletrico_multitemperatura' ||
                fx.showerType === 'ducha_eletronica_haste'
              ) {
                addPart(0.04, 0.04, 0.3, 2.08, matWetFur, 0, 0.1, true);
                addPart(0.22, 0.09, 0.22, 2.04, matWetFur, 0, 0.24);
              } else {
                addPart(0.03, 0.03, 0.28, 2.08, matStainless, 0, 0.1, true);
                addPart(0.18, 0.03, 0.18, 2.05, matStainless, 0, 0.22);
              }
            } else if (isArchRender && f.category === 'box') {
              addPart(f.width, 0.05, f.depth, 0.025, matTileWet, 0, 0, true);
              if (fx.drainType === 'ralo_linear_oculto') {
                addPart(f.width * 0.78, 0.015, 0.07, 0.055, matStainless, 0, -f.depth * 0.36);
              } else {
                addPart(0.12, 0.02, 0.12, 0.055, matStainless, 0, 0);
              }
              const glassBox = new THREE.Mesh(
                new THREE.BoxGeometry(f.width - 0.02, 1.9, 0.02),
                matGlass,
              );
              glassBox.position.set(0, 0.97, f.depth / 2 - 0.02);
              furGroup.add(glassBox);
            } else if (isArchRender && f.category === 'maquina_lavar') {
              addPart(f.width, f.height, f.depth, f.height / 2, matWetFur, 0, 0, true);
              addPart(f.width * 0.58, f.width * 0.58, 0.03, f.height * 0.45, matBlackGlass, 0, f.depth / 2 + 0.015);
            } else {
              const isWet =
                f.category === 'lavatorio' ||
                f.category === 'tanque' ||
                f.category === 'bancada' ||
                f.category === 'vaso_sanitario' ||
                f.category === 'box';
              addPart(f.width, f.height, f.depth, f.height / 2, isWet ? matWetFur : matFabric, 0, 0, true);
            }

            group.add(furGroup);
          }
        }

        // MEP & Special Systems Points
        const isSpecEp = (cat: string) =>
          ['dados', 'tv', 'antena_tv', 'wifi_ap', 'cftv', 'rack_ti', 'interfone'].includes(cat);

        if (layers.eletrica && (!isArchRender || project.electricalHeights)) {
          for (const ep of ut.electricalPoints) {
            if (isSpecEp(ep.category)) continue;
            if (isArchRender && ep.category !== 'iluminacao_teto') continue;
            const pt = mapUnitPt(inst, ut.width, ep.x, ep.y);
            const eGeom =
              ep.category === 'iluminacao_teto'
                ? new THREE.CylinderGeometry(0.16, 0.16, 0.035, 14)
                : new THREE.BoxGeometry(0.09, 0.14, 0.09);
            const eMesh = new THREE.Mesh(eGeom, ep.category === 'iluminacao_teto' && isArchRender ? matWetFur : matElec);
            eMesh.position.set(pt.x, baseY + floor.slabThickness + ep.z, pt.z);
            eMesh.userData = {
              bimLabel: `${ep.code} (${ep.label}) — Unid. ${inst.unitNumber}`,
              bimDiscipline: 'Elétrica',
              bimDetail: `Z=${ep.z.toFixed(2)}m · ${ep.powerVA}VA · ${ep.voltage}V · ${ep.circuitId}`,
            };
            group.add(eMesh);
          }
        }

        if (layers.especiais) {
          for (const ep of ut.electricalPoints) {
            if (!isSpecEp(ep.category)) continue;
            const pt = mapUnitPt(inst, ut.width, ep.x, ep.y);
            const sGeom =
              ep.category === 'wifi_ap'
                ? new THREE.CylinderGeometry(0.11, 0.11, 0.03, 14)
                : ep.category === 'cftv'
                  ? new THREE.CylinderGeometry(0.05, 0.07, 0.14, 10)
                  : new THREE.BoxGeometry(0.08, 0.12, 0.04);
            const sMesh = new THREE.Mesh(sGeom, matSpecial);
            sMesh.position.set(pt.x, baseY + floor.slabThickness + ep.z, pt.z);
            if (ep.category === 'cftv') {
              sMesh.rotation.x = Math.PI / 3;
            }
            sMesh.userData = {
              bimLabel: `${ep.code} (${ep.label}) — Unid. ${inst.unitNumber}`,
              bimDiscipline: 'Instalações Especiais',
              bimDetail: `Z=${ep.z.toFixed(2)}m · ${ep.circuitId} · ${ep.category.toUpperCase()}`,
            };
            group.add(sMesh);
          }
        }

        if (layers.hidraulica && !isArchRender) {
          for (const wp of ut.waterPoints) {
            const pt = mapUnitPt(inst, ut.width, wp.x, wp.y);
            const mat = wp.waterType === 'quente' ? matHotWater : matColdWater;
            const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), mat);
            sphere.position.set(pt.x, baseY + floor.slabThickness + wp.z, pt.z);
            sphere.userData = {
              bimLabel: `${wp.code} (${wp.equipment}) — Unid. ${inst.unitNumber}`,
              bimDiscipline: 'Hidráulica',
              bimDetail: `${wp.waterType === 'quente' ? 'Água Quente' : 'Água Fria'} Ø${wp.diameterMm}mm · Z=${wp.z.toFixed(2)}m`,
            };
            group.add(sphere);

            const riserH = Math.max(0.2, ut.ceilingHeight - wp.z);
            const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, riserH, 8), mat);
            riser.position.set(pt.x, baseY + floor.slabThickness + wp.z + riserH / 2, pt.z);
            group.add(riser);
          }
        }

        if (layers.sanitaria && !isArchRender) {
          for (const dp of ut.drainagePoints) {
            const pt = mapUnitPt(inst, ut.width, dp.x, dp.y);
            const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.18, 10), matDrain);
            cyl.position.set(pt.x, baseY + floor.slabThickness + 0.09, pt.z);
            cyl.userData = {
              bimLabel: `${dp.code} (${dp.category}) — Unid. ${inst.unitNumber}`,
              bimDiscipline: 'Sanitária',
              bimDetail: `Ø${dp.diameterMm}mm · Decliv. ${dp.slopePercent}% · ${dp.uhc} UHC`,
            };
            group.add(cyl);
          }
        }
      });

      // Corridor / Circulation slab
      if (layers.arquitetura && Number.isFinite(minBuildingX)) {
        const corrW = Math.max(1.2, floor.corridorWidth);
        const corrD = Math.max(4, maxBuildingZ - minBuildingZ);
        const corrX = (minBuildingX + maxBuildingX) / 2;
        const corrZ = (minBuildingZ + maxBuildingZ) / 2;
        const corrGeom = new THREE.BoxGeometry(corrW, floor.slabThickness, corrD);
        const corrMesh = new THREE.Mesh(corrGeom, matSlab);
        corrMesh.position.set(corrX, baseY + floor.slabThickness / 2, corrZ);
        corrMesh.receiveShadow = !isSoftwareGl;
        corrMesh.userData = {
          bimLabel: `Circulação Comum — ${floor.name}`,
          bimDiscipline: 'Arquitetura',
          bimDetail: `Largura ${corrW.toFixed(2)} m · Área comum ${floor.commonAreaM2} m²`,
        };
        group.add(corrMesh);
      }
    });

    // 3. Structural elements (Conceptual)
    if (layers.estrutura) {
      for (const st of project.structuralElements) {
        const fIdx = Math.max(0, project.floors.findIndex((f) => f.id === st.floorId));
        const fl = project.floors[fIdx] ?? project.floors[0];
        const baseY = (fl?.elevation ?? 0) + fIdx * explodedOffset;
        const geom = new THREE.BoxGeometry(st.width, st.height, st.depth);
        const mesh = new THREE.Mesh(geom, isArchRender ? matFascia : matStruct);
        mesh.position.set(
          st.x - centerOffset.x + st.width / 2,
          baseY + st.height / 2,
          st.y - centerOffset.z + st.depth / 2,
        );
        mesh.castShadow = !isSoftwareGl;
        mesh.userData = {
          bimLabel: `${st.code} (${st.type.toUpperCase()})`,
          bimDiscipline: 'Estrutura Conceitual',
          bimDetail: `${st.sectionLabel} · ${st.material}`,
        };
        group.add(mesh);
      }
    }

    // 4. Conjunto Laje de Cobertura + Castelo da Caixa d'Água sobre a Laje + Telhado Fechado
    if (layers.cobertura && !isInternalView && Number.isFinite(minBuildingX)) {
      const topFlIdx = Math.max(0, project.floors.length - 1);
      const topFl = project.floors[topFlIdx];
      const maxTopWallHeight = Math.max(
        topFl?.floorToFloorHeight ?? 2.95,
        ...((topFl?.units ?? []).map((u) => {
          const unitUt = project.unitTypes.find((t) => t.id === u.unitTypeId);
          return unitUt ? unitUt.ceilingHeight + (topFl?.slabThickness ?? 0.15) : 0;
        })),
      );
      const roofY =
        (topFl?.elevation ?? 0) +
        maxTopWallHeight +
        topFlIdx * explodedOffset;
      const extWallPad = Math.max(0.08, (project.constructionMethod.externalWallThickness || 0.15) / 2);
      const rW = Math.max(1.5, maxBuildingX - minBuildingX + extWallPad * 2);
      const rD = Math.max(1.5, maxBuildingZ - minBuildingZ + extWallPad * 2);
      const rX = (minBuildingX + maxBuildingX) / 2;
      const rZ = (minBuildingZ + maxBuildingZ) / 2;

      const matRoof = new THREE.MeshStandardMaterial({
        map: roofTex?.map ?? null,
        bumpMap: roofTex?.bumpMap ?? null,
        bumpScale: 0.025,
        color: roofTex ? 0xffffff : mapRoofColor(rs.roofMaterial),
        roughness: 0.55,
        metalness: rs.roofMaterial === 'termoacustica_zinco' ? 0.45 : 0.1,
        clippingPlanes,
      });

      const totalResLiters = Math.max(
        1000,
        Math.round(
          Math.max(1, totalUnitsPlaced) *
            (project.hydraulicConfig.occupantsPerUnit || 2) *
            (project.hydraulicConfig.litersPerPersonDay || 150) *
            (project.hydraulicConfig.reserveDays || 2) *
            0.4,
        ),
      );

      const roofGroup = buildRoofAndWaterTowerGroup({
        x: rX - rW / 2,
        y: rZ - rD / 2,
        width: rW,
        depth: rD,
        baseElevationY: roofY,
        roofShape: rs.roofShape ?? 'platibanda',
        roofFinish: rs.roofMaterial,
        slopePercent: project.constructionMethod.roofSlopePercent,
        facadeMat: matExtWall,
        slabMat: matSlab,
        roofMat: matRoof,
        tankMat: matTankBlue,
        pipeMat: matColdWater,
        isSoftwareGl,
        showRoofShell,
        reservoirLiters: totalResLiters,
      });
      roofGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && !obj.userData?.bimLabel) {
          obj.userData = {
            bimLabel: 'Cobertura do Empreendimento',
            bimDiscipline: 'Cobertura',
            bimDetail: `${(rs.roofShape ?? 'platibanda').replace(/_/g, ' ')} · ${rs.roofMaterial.replace(/_/g, ' ')} · i=${project.constructionMethod.roofSlopePercent}%`,
          };
        }
      });
      group.add(roofGroup);
    }

    // 5. Paisagismo, Pisos Externos, Piscina, Área Gourmet & Espécies Botânicas 3D
    if (layers.paisagismo && !isInternalView) {
      const land = project.landscaping ?? createDefaultLandscaping();
      const nightOn = rs.timeOfDay === 'noite' || rs.artificialLightsOn;
      // Lot base exterior surface zones
      for (const zone of land.surfaceZones) {
        const surfTex = isArchRender ? createExteriorSurfaceTextures(zone.surfaceType, maxAniso) : null;
        if (surfTex) {
          disposableTextures.push(surfTex.map);
          if (surfTex.bumpMap) disposableTextures.push(surfTex.bumpMap);
        }
        const zMat = new THREE.MeshStandardMaterial({
          map: surfTex?.map ?? null,
          bumpMap: surfTex?.bumpMap ?? null,
          bumpScale: 0.018,
          color: surfTex ? 0xffffff : 0x94a3b8,
          roughness: zone.surfaceType === 'deck_madeira' ? 0.62 : 0.88,
          metalness: 0.02,
          clippingPlanes,
        });
        const zMesh = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(0.2, zone.width), 0.04, Math.max(0.2, zone.depth)),
          zMat,
        );
        zMesh.position.set(
          zone.x + zone.width / 2 - centerOffset.x,
          0.022,
          zone.y + zone.depth / 2 - centerOffset.z,
        );
        zMesh.receiveShadow = !isSoftwareGl;
        zMesh.userData = {
          bimLabel: zone.label,
          bimDiscipline: 'Paisagismo & Piso',
          bimDetail: `${zone.width.toFixed(1)}×${zone.depth.toFixed(1)}m (${zone.surfaceType.replace(/_/g, ' ')})`,
        };
        group.add(zMesh);
      }

      // Swimming pools
      for (const pool of land.pools) {
        const { group: poolGrp } = buildPool3D(pool, 0.01, nightOn, isSoftwareGl, maxAniso);
        poolGrp.position.x -= centerOffset.x;
        poolGrp.position.z -= centerOffset.z;
        group.add(poolGrp);
      }

      // Gourmet Areas
      for (const gArea of land.gourmetAreas) {
        const gGrp = buildGourmetArea3D(gArea, 0.01, nightOn, isSoftwareGl);
        gGrp.position.x -= centerOffset.x;
        gGrp.position.z -= centerOffset.z;
        group.add(gGrp);
      }

      // Trees, Palms, Fruit Trees & Shrubs
      for (const plant of land.plants) {
        const pGrp = buildBotanicalPlant3D(plant.speciesId, plant.scale, isSoftwareGl);
        pGrp.position.set(plant.x - centerOffset.x, 0, plant.y - centerOffset.z);
        if (plant.rotationDeg) {
          pGrp.rotation.y = (plant.rotationDeg * Math.PI) / 180;
        }
        group.add(pGrp);
      }
    }

    if (Number.isFinite(minBuildingX)) {
      buildingBoundsRef.current = {
        minX: minBuildingX,
        maxX: maxBuildingX,
        minZ: minBuildingZ,
        maxZ: maxBuildingZ,
        maxY: totalBuildingHeight,
      };
    } else {
      buildingBoundsRef.current = {
        minX: -siteBox.width / 2,
        maxX: siteBox.width / 2,
        minZ: -siteBox.depth / 2,
        maxZ: siteBox.depth / 2,
        maxY: 3.5,
      };
    }
    unitViewsRef.current = computedUnitViews;

    // Auto-reposition camera when entering or changing unit in internal view
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (isInternalView && cam && ctrl && computedUnitViews.length > 0) {
      const idx = Math.min(selectedInternalUnitIdx, computedUnitViews.length - 1);
      const uv = computedUnitViews[idx];
      cam.fov = 64;
      cam.near = 0.08;
      cam.updateProjectionMatrix();
      cam.position.copy(uv.eye);
      ctrl.target.copy(uv.target);
      ctrl.minDistance = 0.25;
      ctrl.maxDistance = 30;
      ctrl.update();
    }

    requestRenderRef.current();

    return () => {
      for (const tex of disposableTextures) {
        tex.dispose();
      }
    };
  }, [
    project,
    layers,
    sectionCutHeight,
    explodedOffset,
    centerOffset,
    siteBox,
    totalBuildingHeight,
    totalUnitsPlaced,
    activeCameraPreset,
    selectedInternalUnitIdx,
    selectedOpening3D,
    showRoofShell,
  ]);

  const setCameraPreset = (
    preset: 'perspectiva' | 'frontal' | 'lateral' | 'superior' | 'aerea' | 'interna',
    unitIdxOverride?: number,
  ) => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    setActiveCameraPreset(preset);

    const b = buildingBoundsRef.current;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const cy = Math.max(1.6, b.maxY * 0.45);
    const span = Math.max(8, b.maxX - b.minX, b.maxZ - b.minZ, b.maxY);

    if (preset === 'interna') {
      cam.fov = 64;
      cam.near = 0.08;
      cam.updateProjectionMatrix();
      ctrl.minDistance = 0.25;
      ctrl.maxDistance = 30;
      const views = unitViewsRef.current;
      if (views.length > 0) {
        const idx = Math.min(unitIdxOverride ?? selectedInternalUnitIdx, views.length - 1);
        const uv = views[idx];
        cam.position.copy(uv.eye);
        ctrl.target.copy(uv.target);
      } else {
        cam.position.set(cx + 1.8, 1.65, cz + 2.2);
        ctrl.target.set(cx - 1.0, 1.1, cz - 1.2);
      }
      ctrl.update();
      requestRenderRef.current();
      return;
    }

    cam.fov = 42;
    cam.near = 0.2;
    cam.updateProjectionMatrix();
    ctrl.minDistance = 2.5;
    ctrl.maxDistance = 120;

    switch (preset) {
      case 'frontal':
        cam.position.set(cx, cy + 1.5, cz + span * 1.45);
        ctrl.target.set(cx, cy, cz);
        break;
      case 'lateral':
        cam.position.set(cx + span * 1.45, cy + 1.5, cz);
        ctrl.target.set(cx, cy, cz);
        break;
      case 'superior':
        cam.position.set(cx, Math.max(22, span * 1.65), cz + 0.01);
        ctrl.target.set(cx, 0, cz);
        break;
      case 'aerea':
        cam.position.set(cx - span * 1.15, span * 1.05, cz + span * 1.15);
        ctrl.target.set(cx, cy * 0.7, cz);
        break;
      default:
        cam.position.set(cx + span * 1.05, span * 0.65, cz + span * 1.25);
        ctrl.target.set(cx, cy, cz);
    }
    ctrl.update();
    requestRenderRef.current();
  };

  const captureCompactPngDataUrl = (): string | null => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const cam = cameraRef.current;
    if (!renderer || !scene || !cam) return null;
    renderer.render(scene, cam);
    const srcCanvas = renderer.domElement;

    const encodeAtWidth = (maxW: number, mime: 'image/png' | 'image/jpeg', quality?: number) => {
      const targetW = Math.min(maxW, srcCanvas.width);
      const scale = targetW / srcCanvas.width;
      const off = document.createElement('canvas');
      off.width = targetW;
      off.height = Math.max(1, Math.round(srcCanvas.height * scale));
      const ctx = off.getContext('2d');
      if (!ctx) return srcCanvas.toDataURL(mime, quality);
      ctx.drawImage(srcCanvas, 0, 0, off.width, off.height);
      return off.toDataURL(mime, quality);
    };

    // Keep under Firestore's 750 KB dataUrl limit with PNG first, JPEG fallback if dense
    let out = encodeAtWidth(920, 'image/png');
    if (out.length > 680000) {
      out = encodeAtWidth(920, 'image/jpeg', 0.85);
    }
    if (out.length > 680000) {
      out = encodeAtWidth(760, 'image/jpeg', 0.78);
    }
    return out;
  };

  const handleCapturePNG = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const cam = cameraRef.current;
    if (!renderer || !scene || !cam) return;
    renderer.render(scene, cam);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${project.code}_Render_3D_${activeCameraPreset}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setRenderNotice('Render PNG exportado em alta resolução.');
    setTimeout(() => setRenderNotice(null), 4000);
  };

  const handleSaveRenderToProject = () => {
    const dataUrl = captureCompactPngDataUrl();
    if (!dataUrl) return;
    const presetLabels: Record<string, string> = {
      perspectiva: 'Perspectiva Principal',
      frontal: 'Fachada Frontal',
      lateral: 'Elevação Lateral',
      aerea: 'Vista Aérea',
      superior: 'Implantação Superior',
      interna: 'Vista Interna',
    };
    const renderEntry: CapturedRender = {
      id: nextId('rnd'),
      title: `${presetLabels[activeCameraPreset] ?? 'Vista 3D'} (${project.renderSettings.timeOfDay})`,
      preset: activeCameraPreset,
      timeOfDay: project.renderSettings.timeOfDay,
      dataUrl,
      createdAt: new Date().toISOString(),
    };
    onUpdateProject(
      (prev) => ({
        ...prev,
        capturedRenders: [renderEntry, ...(prev.capturedRenders ?? [])].slice(0, 6),
      }),
      `Renderização arquitetônica salva na prancha R01 (${renderEntry.title})`,
    );
    onSaveRender?.(renderEntry);
    setRenderNotice('Render salvo na Prancha R01 (Firebase Firestore) e no pacote ZIP!');
    setTimeout(() => setRenderNotice(null), 4500);
  };

  const updateRS = (patch: Partial<RenderMaterialSettings>) => {
    onUpdateProject((prev) => ({
      ...prev,
      renderSettings: { ...prev.renderSettings, ...patch },
    }));
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#14161A] text-slate-100">
      {/* Isolated 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="h-full w-full" />

      {/* Top Overlay HUD (no backdrop-blur over WebGL) */}
      <div className="pointer-events-none absolute inset-x-4 top-3 flex flex-wrap xl:flex-nowrap items-start justify-between gap-2">
        <div className="pointer-events-auto rounded-lg border border-slate-700/90 bg-[#1B1E24] px-3 py-2 shadow-lg space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white whitespace-nowrap">
              Estúdio 3D BIM
            </span>
            <div className="flex items-center rounded border border-slate-700 bg-[#14161A] p-0.5">
              <button
                type="button"
                onClick={() => updateRS({ renderQuality: 'arquitetonico' })}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
                  renderQuality === 'arquitetonico'
                    ? 'bg-[#2F7CF6] text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Sparkles className="h-3 w-3" />
                Render Arquitetônico
              </button>
              <button
                type="button"
                onClick={() => updateRS({ renderQuality: 'tecnico' })}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
                  renderQuality === 'tecnico'
                    ? 'bg-[#2F7CF6] text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Técnico BIM
              </button>
            </div>
          </div>
          <div className="text-[10.5px] text-slate-400">
            Arraste para orbitar · Scroll para zoom · Clique para inspecionar
          </div>
          {totalUnitsPlaced === 0 && (
            <div className="text-[11px] font-medium text-amber-300">
              Lote vazio: crie tipologias e posicione unidades nos pavimentos para renderizar a edificação 3D.
            </div>
          )}
          {renderNotice && (
            <div className="text-[11px] font-medium text-emerald-400">{renderNotice}</div>
          )}
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-lg border border-slate-700/90 bg-[#1B1E24] p-1.5 shadow-lg">
          {(
            [
              ['perspectiva', 'Perspectiva'],
              ['frontal', 'Fachada'],
              ['lateral', 'Lateral'],
              ['aerea', 'Aérea'],
              ['superior', 'Superior'],
              ['interna', 'Interna'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setCameraPreset(id)}
              className={`rounded px-2 py-1 text-[11.5px] font-medium whitespace-nowrap transition ${
                activeCameraPreset === id
                  ? 'bg-[#2F7CF6]/25 text-white border border-[#2F7CF6]/60'
                  : 'text-slate-200 hover:bg-[#2F7CF6] hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
          {activeCameraPreset === 'interna' && (project.floors[0]?.units.length ?? 0) > 0 && (
            <select
              value={Math.min(selectedInternalUnitIdx, (project.floors[0]?.units.length ?? 1) - 1)}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setSelectedInternalUnitIdx(idx);
                setCameraPreset('interna', idx);
              }}
              aria-label="Selecionar unidade para vista interna"
              className="rounded border border-[#2F7CF6] bg-[#14161A] px-1.5 py-1 text-[11px] text-white"
            >
              {project.floors[0].units.map((u, idx) => (
                <option key={u.id} value={idx}>
                  Unid. {u.unitNumber}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={handleSaveRenderToProject}
            className="ml-0.5 inline-flex items-center gap-1 rounded border border-emerald-500/50 bg-emerald-600/20 px-2 py-1 text-[11.5px] font-medium text-emerald-200 hover:bg-emerald-600/35 whitespace-nowrap"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            Salvar na Prancha R01 ({project.capturedRenders?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={handleCapturePNG}
            className="inline-flex items-center gap-1 rounded bg-[#2F7CF6] px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-[#2567d4] whitespace-nowrap"
          >
            <Camera className="h-3.5 w-3.5" />
            Baixar PNG
          </button>
        </div>
      </div>

      {/* Collapsible Bottom Control Dock */}
      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
        <div className="pointer-events-auto w-full max-w-[1140px] rounded-lg border border-slate-700/90 bg-[#1B1E24] shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-3.5 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDockTab('disciplinas');
                  setDockOpen(true);
                }}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
                  dockTab === 'disciplinas' && dockOpen
                    ? 'bg-[#2F7CF6] text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Disciplinas
              </button>
              <button
                type="button"
                onClick={() => {
                  setDockTab('corte');
                  setDockOpen(true);
                }}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
                  dockTab === 'corte' && dockOpen
                    ? 'bg-[#2F7CF6] text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Scissors className="h-3.5 w-3.5" />
                Corte & Explodida
              </button>
              <button
                type="button"
                onClick={() => {
                  setDockTab('iluminacao');
                  setDockOpen(true);
                }}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
                  dockTab === 'iluminacao' && dockOpen
                    ? 'bg-[#2F7CF6] text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                Luz & Materiais PBR
              </button>

              {selectedInfo && (
                <div className="ml-2 border-l border-slate-700 pl-3 text-xs">
                  <span className="font-semibold text-[#2F7CF6]">{selectedInfo.discipline}:</span>{' '}
                  <span className="font-medium text-white">{selectedInfo.label}</span>{' '}
                  <span className="text-slate-400">· {selectedInfo.detail}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setDockOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              aria-label={dockOpen ? 'Recolher painel 3D' : 'Expandir painel 3D'}
            >
              {dockOpen ? (
                <>
                  Recolher <ChevronDown className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Controles <ChevronUp className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>

          {dockOpen && (
            <div className="p-3.5">
              {dockTab === 'disciplinas' && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        ['arquitetura', 'Arquitetura'],
                        ['cobertura', 'Cobertura & Telhado'],
                        ['paisagismo', 'Paisagismo & Lazer'],
                        ['estrutura', 'Estrutura Conceitual'],
                        ['mobiliario', 'Mobiliário'],
                        ['eletrica', 'Elétrica (X/Y/Z)'],
                        ['especiais', 'Especiais (CFTV/Dados/TV)'],
                        ['hidraulica', 'Hidráulica (AF/AQ)'],
                        ['sanitaria', 'Sanitária'],
                      ] as const
                    ).map(([key, label]) => {
                      const active = layers[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
                          className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition ${
                            active
                              ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                              : 'border-slate-700 bg-[#14161A] text-slate-400'
                          }`}
                        >
                          {active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                          {label}
                        </button>
                      );
                    })}
                    {layers.cobertura && (
                      <button
                        type="button"
                        onClick={() => setShowRoofShell((s) => !s)}
                        className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition ${
                          !showRoofShell
                            ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                            : 'border-slate-700 bg-[#14161A] text-slate-300 hover:text-white'
                        }`}
                      >
                        {showRoofShell ? 'Abrir Telhado (Ver Laje + Castelo)' : 'Fechar Telhado Completo'}
                      </button>
                    )}
                  </div>

                  {selectedOpening3D &&
                    (() => {
                      const ut = project.unitTypes.find((u) => u.id === selectedOpening3D.unitTypeId);
                      const op = ut?.openings.find((o) => o.id === selectedOpening3D.openingId);
                      const wall = ut?.walls.find((w) => w.id === op?.wallId);
                      if (!ut || !op || !wall) return null;
                      const wallLen = getWallLength(wall);
                      const maxOff = Math.max(0.05, round2(wallLen - op.width - 0.04));
                      const patchOp = (patch: Partial<Opening>) => {
                        onUpdateProject((prev) => ({
                          ...prev,
                          unitTypes: prev.unitTypes.map((u) =>
                            u.id !== ut.id
                              ? u
                              : {
                                  ...u,
                                  openings: u.openings.map((o) =>
                                    o.id === op.id ? { ...o, ...patch } : o,
                                  ),
                                },
                          ),
                        }));
                      };
                      return (
                        <div className="flex flex-wrap items-center gap-3 rounded border border-[#2F7CF6]/50 bg-[#14161A] px-3 py-2 text-xs">
                          <span className="inline-flex items-center gap-1 font-semibold text-sky-300">
                            <Move className="h-3.5 w-3.5" />
                            Esquadria 3D: {op.code} ({op.width.toFixed(2)}m)
                          </span>
                          <label className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-400">Parede:</span>
                            <select
                              value={op.wallId}
                              onChange={(e) => {
                                const nw = ut.walls.find((w) => w.id === e.target.value);
                                const nLen = nw ? getWallLength(nw) : 3;
                                patchOp({
                                  wallId: e.target.value,
                                  offsetAlongWall: round2(
                                    Math.max(0.04, Math.min(Math.max(0.04, nLen - op.width - 0.04), op.offsetAlongWall)),
                                  ),
                                });
                                setSelectedOpening3D({ ...selectedOpening3D, wallId: e.target.value });
                              }}
                              className="rounded border border-slate-700 bg-[#1B1E24] px-2 py-0.5 text-[11px] text-white"
                            >
                              {ut.walls.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.code} ({getWallLength(w).toFixed(2)}m)
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-400">
                              Posição ({op.offsetAlongWall.toFixed(2)}m):
                            </span>
                            <input
                              type="range"
                              min={0.04}
                              max={maxOff}
                              step={0.05}
                              value={Math.min(maxOff, op.offsetAlongWall)}
                              onChange={(e) => patchOp({ offsetAlongWall: Number(e.target.value) })}
                              className="w-28 accent-[#2F7CF6]"
                            />
                          </label>
                          {op.type === 'janela' && (
                            <label className="flex items-center gap-1.5">
                              <span className="text-[11px] text-slate-400">Peitoril:</span>
                              <input
                                type="number"
                                step={0.05}
                                min={0}
                                max={2.2}
                                value={op.sillHeight}
                                onChange={(e) => patchOp({ sillHeight: Math.max(0, Number(e.target.value)) })}
                                className="w-16 rounded border border-slate-700 bg-[#1B1E24] px-1.5 py-0.5 font-mono text-[11px] text-white"
                              />
                            </label>
                          )}
                          <span className="ml-auto text-[10.5px] text-slate-400">
                            Dica: arraste a esquadria diretamente no modelo 3D
                          </span>
                        </div>
                      );
                    })()}
                </div>
              )}

              {dockTab === 'corte' && (
                <div className="grid gap-6 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">Plano de Corte Horizontal (Seção Y)</span>
                      <span className="font-mono tabular-nums text-white">
                        {sectionCutHeight > totalBuildingHeight ? 'Desativado' : `${sectionCutHeight.toFixed(1)} m`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.6}
                      max={Math.ceil(totalBuildingHeight + 2)}
                      step={0.2}
                      value={sectionCutHeight}
                      onChange={(e) => setSectionCutHeight(Number(e.target.value))}
                      className="w-full accent-[#2F7CF6]"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">Vista Explodida entre Pavimentos</span>
                      <span className="font-mono tabular-nums text-white">
                        +{explodedOffset.toFixed(1)} m
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={6}
                      step={0.2}
                      value={explodedOffset}
                      onChange={(e) => setExplodedOffset(Number(e.target.value))}
                      className="w-full accent-[#2F7CF6]"
                    />
                  </label>
                </div>
              )}

              {dockTab === 'iluminacao' && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                  <div className="space-y-1">
                    <span className="text-[11px] text-slate-400">Cenário Solar</span>
                    <div className="flex gap-1">
                      {(['dia', 'entardecer', 'noite'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => updateRS({ timeOfDay: t })}
                          className={`flex-1 rounded border px-1.5 py-1 text-[11px] capitalize ${
                            project.renderSettings.timeOfDay === t
                              ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white'
                              : 'border-slate-700 bg-[#14161A] text-slate-300'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-400">
                      Azimute Sol ({project.renderSettings.sunAzimuthDeg}°)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={project.renderSettings.sunAzimuthDeg}
                      onChange={(e) => updateRS({ sunAzimuthDeg: Number(e.target.value) })}
                      className="w-full accent-[#2F7CF6]"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Palette className="h-3 w-3" /> Fachada (PBR)
                    </span>
                    <div className="flex gap-1">
                      <input
                        type="color"
                        value={project.renderSettings.facadeColor}
                        onChange={(e) => updateRS({ facadeColor: e.target.value })}
                        className="h-7 w-9 shrink-0 cursor-pointer rounded border border-slate-700 bg-[#14161A]"
                      />
                      <select
                        value={project.renderSettings.wallExteriorFinish ?? 'textura_acrilica'}
                        onChange={(e) =>
                          updateRS({
                            wallExteriorFinish: e.target.value as RenderMaterialSettings['wallExteriorFinish'],
                          })
                        }
                        className="w-full rounded border border-slate-700 bg-[#14161A] px-1.5 py-1 text-[11px] text-white"
                      >
                        <option value="textura_acrilica">Textura Acrílica</option>
                        <option value="reboco_liso">Reboco Liso</option>
                        <option value="tijolinho_aparente">Tijolinho Aparente</option>
                        <option value="pedra_madeira">Pedra / Canjiquinha</option>
                        <option value="ripado_madeira">Ripado Madeira</option>
                        <option value="cimento_queimado">Cimento Queimado</option>
                      </select>
                    </div>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-400">Parede Interna</span>
                    <select
                      value={project.renderSettings.wallInteriorFinish ?? 'pintura_fosca'}
                      onChange={(e) =>
                        updateRS({
                          wallInteriorFinish: e.target.value as RenderMaterialSettings['wallInteriorFinish'],
                        })
                      }
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-xs text-white"
                    >
                      <option value="pintura_fosca">Pintura Fosca</option>
                      <option value="cimento_queimado">Cimento Queimado</option>
                      <option value="ceramica_metro">Cerâmica Metrô</option>
                      <option value="madeira_acoplada">Painel Madeira</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-400">Piso Interno PBR</span>
                    <select
                      value={project.renderSettings.floorMaterial}
                      onChange={(e) =>
                        updateRS({
                          floorMaterial: e.target.value as RenderMaterialSettings['floorMaterial'],
                        })
                      }
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-xs text-white"
                    >
                      <option value="porcelanato_cinza">Porcelanato Cinza</option>
                      <option value="porcelanato_marmorizado">Porcelanato Mármore</option>
                      <option value="ceramica_bege">Cerâmica Bege</option>
                      <option value="madeira_carvalho">Madeira Carvalho</option>
                      <option value="piso_vinilico">Piso Vinílico</option>
                      <option value="cimento_queimado">Cimento Queimado</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-400">Formato Telhado</span>
                    <select
                      value={project.renderSettings.roofShape ?? 'platibanda'}
                      onChange={(e) =>
                        updateRS({
                          roofShape: e.target.value as RenderMaterialSettings['roofShape'],
                        })
                      }
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-xs text-white"
                    >
                      <option value="platibanda">Platibanda Embutida</option>
                      <option value="duas_aguas">Duas Águas</option>
                      <option value="uma_agua">Uma Água</option>
                      <option value="laje_plana">Laje Plana</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-400">Telha PBR</span>
                    <select
                      value={project.renderSettings.roofMaterial}
                      onChange={(e) =>
                        updateRS({
                          roofMaterial: e.target.value as RenderMaterialSettings['roofMaterial'],
                        })
                      }
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-xs text-white"
                    >
                      <option value="termoacustica_zinco">Termoacústica Zinco</option>
                      <option value="ceramica_terracota">Cerâmica Terracota</option>
                      <option value="fibrocimento_cinza">Fibrocimento</option>
                      <option value="concreto_impermeabilizado">Concreto Impermeab.</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-2 pt-4 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={project.renderSettings.artificialLightsOn}
                      onChange={(e) => updateRS({ artificialLightsOn: e.target.checked })}
                    />
                    Luzes internas
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
