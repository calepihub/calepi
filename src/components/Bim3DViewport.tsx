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
  createFacadeStuccoTextures,
  createFloorTextures,
  createRoofTextures,
  createSiteContextTextures,
} from '../engine/proceduralTextures';
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
  const [selectedInfo, setSelectedInfo] = useState<{
    label: string;
    discipline: string;
    detail: string;
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

    // Raycaster click selection
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const onPointerDown = (ev: PointerEvent) => {
      pointerDownPos = { x: ev.clientX, y: ev.clientY };
    };

    const onPointerUp = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - pointerDownPos.x, ev.clientY - pointerDownPos.y);
      if (dist > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
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
        const box = new THREE.BoxHelper(hit.object, 0x3b82f6);
        scene.add(box);
        selectionBoxRef.current = box;
      } else {
        setSelectedInfo(null);
      }
      scheduleRender();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    scheduleRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.removeEventListener('change', handleControlChange);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
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
      hemi.intensity = isInternalView ? 0.85 : 0.34;
      sun.intensity = 0.45;
      sun.color.setHex(0x93c5fd);
    } else if (rs.timeOfDay === 'entardecer') {
      const bg = new THREE.Color(isArchRender ? 0x43303d : 0x241d26);
      scene.background = bg;
      scene.fog = !isSoftwareGl && isArchRender && !isInternalView ? new THREE.FogExp2(0x43303d, 0.007) : null;
      hemi.intensity = isInternalView ? 1.05 : 0.62;
      sun.intensity = 1.9;
      sun.color.setHex(0xfdba74);
    } else {
      const bg = new THREE.Color(isArchRender ? 0xbfd7ee : 0x161b22);
      scene.background = bg;
      scene.fog = !isSoftwareGl && isArchRender && !isInternalView ? new THREE.FogExp2(0xbfd7ee, 0.0055) : null;
      hemi.intensity = isInternalView ? 1.25 : isArchRender ? 0.95 : 0.85;
      sun.intensity = isArchRender ? 2.4 : 2.2;
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
    const stuccoTex = isArchRender ? createFacadeStuccoTextures(rs.facadeColor || '#EAECEE', maxAniso) : null;
    const floorTex = isArchRender ? createFloorTextures(rs.floorMaterial, maxAniso) : null;
    const roofTex = isArchRender ? createRoofTextures(rs.roofMaterial, maxAniso) : null;
    const ctxTex = isArchRender ? createSiteContextTextures(maxAniso) : null;

    if (stuccoTex) {
      disposableTextures.push(stuccoTex.map);
      if (stuccoTex.bumpMap) disposableTextures.push(stuccoTex.bumpMap);
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

      // Street + Sidewalk at the front of the lot (z = maxY - centerOffset.z)
      const frontZ = siteBox.maxY - centerOffset.z;
      const lotW = siteBox.width;

      const sidewalk = new THREE.Mesh(
        new THREE.BoxGeometry(lotW + 16, 0.12, 2.4),
        new THREE.MeshStandardMaterial({
          map: ctxTex?.sidewalkMap ?? null,
          color: ctxTex ? 0xffffff : 0xb8bdc4,
          roughness: 0.85,
        }),
      );
      sidewalk.position.set(0, -0.06, frontZ + 1.2);
      sidewalk.receiveShadow = !isSoftwareGl;
      group.add(sidewalk);

      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(lotW + 16, 0.14, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 }),
      );
      curb.position.set(0, -0.07, frontZ + 2.45);
      group.add(curb);

      const street = new THREE.Mesh(
        new THREE.BoxGeometry(lotW + 28, 0.08, 7.5),
        new THREE.MeshStandardMaterial({
          map: ctxTex?.asphaltMap ?? null,
          color: ctxTex ? 0xffffff : 0x2b2f36,
          roughness: 0.9,
        }),
      );
      street.position.set(0, -0.15, frontZ + 6.3);
      street.receiveShadow = !isSoftwareGl;
      group.add(street);

      // Dashed street lane markings
      for (let mx = -lotW / 2 - 8; mx <= lotW / 2 + 8; mx += 3.2) {
        const dash = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 0.015, 0.12),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6 }),
        );
        dash.position.set(mx, -0.105, frontZ + 6.3);
        group.add(dash);
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

    // Perimeter Boundary Walls (Muros de divisa lateral e fundos) in Architectural Mode
    if (isArchRender && layers.arquitetura && project.site.vertices.length >= 3) {
      const muroMat = new THREE.MeshStandardMaterial({
        color: 0xd1d5db,
        roughness: 0.88,
        clippingPlanes,
      });
      const muroCapMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.5,
        metalness: 0.3,
        clippingPlanes,
      });
      const muroHeight = 1.95;
      for (let i = 0; i < project.site.vertices.length; i++) {
        const va = project.site.vertices[i];
        const vb = project.site.vertices[(i + 1) % project.site.vertices.length];
        // Leave front edge open towards street (where both Y ~ maxY)
        const isFrontEdge =
          Math.abs(va.y - siteBox.maxY) < 0.4 && Math.abs(vb.y - siteBox.maxY) < 0.4;
        if (isFrontEdge) continue;

        const ax = va.x - centerOffset.x;
        const az = va.y - centerOffset.z;
        const bx = vb.x - centerOffset.x;
        const bz = vb.y - centerOffset.z;
        const mLen = Math.hypot(bx - ax, bz - az);
        if (mLen < 0.3) continue;
        const ang = Math.atan2(bz - az, bx - ax);

        const wallMuro = new THREE.Mesh(new THREE.BoxGeometry(mLen, muroHeight, 0.14), muroMat);
        wallMuro.position.set((ax + bx) / 2, muroHeight / 2, (az + bz) / 2);
        wallMuro.rotation.y = -ang;
        wallMuro.castShadow = !isSoftwareGl;
        wallMuro.receiveShadow = !isSoftwareGl;
        group.add(wallMuro);

        const capMuro = new THREE.Mesh(new THREE.BoxGeometry(mLen, 0.05, 0.18), muroCapMat);
        capMuro.position.set((ax + bx) / 2, muroHeight + 0.025, (az + bz) / 2);
        capMuro.rotation.y = -ang;
        group.add(capMuro);
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
      bumpScale: 0.015,
      color: stuccoTex ? 0xffffff : extWallColor,
      roughness: 0.82,
      metalness: 0.04,
      clippingPlanes,
      side: THREE.DoubleSide,
    });
    const matIntWall = new THREE.MeshStandardMaterial({
      color: intWallColor,
      roughness: 0.84,
      metalness: 0.03,
      clippingPlanes,
      side: THREE.DoubleSide,
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
    const matGlass = new THREE.MeshPhysicalMaterial({
      color: 0xa5d8ff,
      transparent: true,
      opacity: 0.36,
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
      color: 0x8f5d38,
      roughness: 0.58,
      metalness: 0.05,
      clippingPlanes,
    });
    const matHandle = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.25,
      metalness: 0.85,
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
      color: 0xf8fafc,
      roughness: 0.22,
      metalness: 0.12,
      clippingPlanes,
    });
    const matStoneCounter = new THREE.MeshStandardMaterial({
      color: 0x26292e,
      roughness: 0.35,
      metalness: 0.1,
      clippingPlanes,
    });
    const matStainless = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.22,
      metalness: 0.88,
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

          for (const w of ut.walls as Wall[]) {
            const len = getWallLength(w);
            if (len < 0.05) continue;
            const pA = mapUnitPt(inst, ut.width, w.start.x, w.start.y);
            const pB = mapUnitPt(inst, ut.width, w.end.x, w.end.y);
            const mx = (pA.x + pB.x) / 2;
            const mz = (pA.z + pB.z) / 2;
            const angle = Math.atan2(pB.z - pA.z, pB.x - pA.x);

            const wallOps = openingsByWall.get(w.id) ?? [];
            const wallGeom = isArchRender
              ? buildWallWithOpeningsGeometry(len, w.height, w.thickness, wallOps)
              : (() => {
                  const g = new THREE.BoxGeometry(len, w.height, w.thickness);
                  g.translate(0, w.height / 2, 0);
                  return g;
                })();

            const wallMesh = new THREE.Mesh(wallGeom, w.isExternal ? matExtWall : matIntWall);
            wallMesh.position.set(mx, baseY + floor.slabThickness, mz);
            wallMesh.rotation.y = -angle;
            wallMesh.castShadow = !isSoftwareGl && !isInternalView;
            wallMesh.receiveShadow = !isSoftwareGl;
            wallMesh.userData = {
              bimLabel: `Parede ${w.code} — Unid. ${inst.unitNumber}`,
              bimDiscipline: 'Arquitetura',
              bimDetail: `${w.isExternal ? 'Externa' : 'Interna'} · e=${Math.round(w.thickness * 100)}cm · ${w.material}`,
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

          // Detailed Doors & Windows Assemblies
          for (const op of ut.openings) {
            const wall = ut.walls.find((w) => w.id === op.wallId);
            if (!wall) continue;
            const pos = getOpeningWorldPosition(wall, op);
            const wp = mapUnitPt(inst, ut.width, pos.center.x, pos.center.y);
            const wallAngle = getWallAngleRad(wall);
            const totalAngle = wallAngle + (inst.rotationDeg * Math.PI) / 180;
            const rotY = inst.mirrored ? totalAngle : -totalAngle;
            const baseOpY = baseY + floor.slabThickness + op.sillHeight;

            if (op.type === 'janela') {
              const jGroup = new THREE.Group();
              jGroup.position.set(wp.x, baseOpY + op.height / 2, wp.z);
              jGroup.rotation.y = rotY;

              const glassPane = new THREE.Mesh(
                new THREE.BoxGeometry(op.width - 0.06, op.height - 0.06, 0.025),
                matGlass,
              );
              glassPane.userData = {
                bimLabel: `${op.code} (${op.subtype}) — Unid. ${inst.unitNumber}`,
                bimDiscipline: 'Esquadrias',
                bimDetail: `${op.width.toFixed(2)}×${op.height.toFixed(2)}m · Peitoril ${op.sillHeight.toFixed(2)}m · ${op.material}`,
              };
              jGroup.add(glassPane);

              // Sill, header, left/right jambs, central mullion
              const frameD = wall.thickness + 0.03;
              const sill = new THREE.Mesh(new THREE.BoxGeometry(op.width + 0.06, 0.045, frameD + 0.04), matFrame);
              sill.position.y = -op.height / 2;
              const head = new THREE.Mesh(new THREE.BoxGeometry(op.width + 0.02, 0.04, frameD), matFrame);
              head.position.y = op.height / 2;
              const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.04, op.height, frameD), matFrame);
              jambL.position.x = -op.width / 2 + 0.02;
              const jambR = new THREE.Mesh(new THREE.BoxGeometry(0.04, op.height, frameD), matFrame);
              jambR.position.x = op.width / 2 - 0.02;
              const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.035, op.height - 0.04, 0.045), matFrame);
              jGroup.add(sill, head, jambL, jambR, mullion);
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
                bimDetail: `${op.width.toFixed(2)}×${op.height.toFixed(2)}m · ${op.material}`,
              };
              dGroup.add(leaf);

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
              group.add(dGroup);
            }
          }
        }

        // Multi-part Architectural Furniture
        if (layers.mobiliario) {
          for (const f of ut.furniture) {
            const fc = mapUnitPt(inst, ut.width, f.x + f.width / 2, f.y + f.depth / 2);
            const rotY = -((inst.rotationDeg + f.rotationDeg) * Math.PI) / 180;
            const fy0 = baseY + floor.slabThickness;
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
                  bimDetail: `${f.width.toFixed(2)}×${f.depth.toFixed(2)}×${f.height.toFixed(2)} m`,
                };
              }
              furGroup.add(m);
            };

            if (isArchRender && f.category === 'cama') {
              // Orient headboard toward the wall end (+d/2 if positioned in lower half of unit)
              const dir = f.y + f.depth > ut.depth * 0.55 ? 1 : -1;
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
              addPart(f.width * 0.85, 0.38, f.depth * 0.72, 0.19, matWetFur, 0, 0.05, true);
              addPart(f.width * 0.9, 0.36, 0.16, 0.56, matWetFur, 0, -f.depth / 2 + 0.09);
              addPart(0.06, 0.02, 0.04, 0.75, matStainless, 0, -f.depth / 2 + 0.09);
            } else if (isArchRender && f.category === 'lavatorio') {
              addPart(f.width * 0.9, 0.55, f.depth * 0.88, 0.52, matWoodDark, 0, 0, true);
              addPart(f.width, 0.05, f.depth, 0.83, matWetFur);
              addPart(0.03, 0.16, 0.03, 0.92, matStainless, 0, -f.depth * 0.32);
            } else if (isArchRender && f.category === 'espelho') {
              addPart(f.width, f.height, 0.03, 1.45, matMirror, 0, 0, true);
            } else if (isArchRender && f.category === 'chuveiro') {
              addPart(0.03, 0.03, 0.28, 2.08, matStainless, 0, 0.1, true);
              addPart(0.16, 0.03, 0.16, 2.05, matStainless, 0, 0.22);
            } else if (isArchRender && f.category === 'box') {
              addPart(f.width, 0.05, f.depth, 0.025, matTileWet, 0, 0, true);
              addPart(0.12, 0.02, 0.12, 0.055, matStainless, 0, 0);
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

    // 4. Architectural Roof + Parapet (Platibanda) + Aluminum Flashing (Rufo)
    if (layers.cobertura && !isInternalView && Number.isFinite(minBuildingX)) {
      const topFlIdx = Math.max(0, project.floors.length - 1);
      const topFl = project.floors[topFlIdx];
      const roofY =
        (topFl?.elevation ?? 0) +
        (topFl?.floorToFloorHeight ?? 2.95) +
        topFlIdx * explodedOffset;
      const rW = maxBuildingX - minBuildingX + 0.65;
      const rD = maxBuildingZ - minBuildingZ + 0.65;
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

      const roofPlate = new THREE.Mesh(new THREE.BoxGeometry(rW, 0.16, rD), matRoof);
      roofPlate.position.set(rX, roofY + 0.08, rZ);
      roofPlate.castShadow = !isSoftwareGl;
      roofPlate.receiveShadow = !isSoftwareGl;
      roofPlate.userData = {
        bimLabel: 'Cobertura do Empreendimento',
        bimDiscipline: 'Cobertura',
        bimDetail: `${project.constructionMethod.roofType.replace(/_/g, ' ')} · Inclinação ${project.constructionMethod.roofSlopePercent}%`,
      };
      group.add(roofPlate);

      // Platibanda & anodized flashing around building perimeter
      if (isArchRender) {
        const pH = 0.65;
        const pT = 0.16;
        const parapetMat = matExtWall;
        const flashingMat = matFrame;

        const addParapet = (w: number, d: number, px: number, pz: number) => {
          const wall = new THREE.Mesh(new THREE.BoxGeometry(w, pH, d), parapetMat);
          wall.position.set(px, roofY + 0.16 + pH / 2, pz);
          wall.castShadow = !isSoftwareGl;
          wall.receiveShadow = !isSoftwareGl;
          group.add(wall);

          const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.045, d + 0.04), flashingMat);
          cap.position.set(px, roofY + 0.16 + pH + 0.02, pz);
          group.add(cap);
        };

        addParapet(rW, pT, rX, rZ - rD / 2 + pT / 2);
        addParapet(rW, pT, rX, rZ + rD / 2 - pT / 2);
        addParapet(pT, rD - pT * 2, rX - rW / 2 + pT / 2, rZ);
        addParapet(pT, rD - pT * 2, rX + rW / 2 - pT / 2, rZ);
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
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ['arquitetura', 'Arquitetura'],
                      ['cobertura', 'Cobertura & Platibanda'],
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
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                  <div className="space-y-1">
                    <span className="text-[11px] text-slate-400">Cenário Solar</span>
                    <div className="flex gap-1">
                      {(['dia', 'entardecer', 'noite'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => updateRS({ timeOfDay: t })}
                          className={`flex-1 rounded border px-2 py-1 text-xs capitalize ${
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
                      <Palette className="h-3 w-3" /> Fachada (Textura)
                    </span>
                    <input
                      type="color"
                      value={project.renderSettings.facadeColor}
                      onChange={(e) => updateRS({ facadeColor: e.target.value })}
                      className="h-7 w-full cursor-pointer rounded border border-slate-700 bg-[#14161A]"
                    />
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
                      <option value="ceramica_bege">Cerâmica Bege</option>
                      <option value="madeira_carvalho">Madeira Carvalho</option>
                      <option value="cimento_queimado">Cimento Queimado</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-400">Cobertura PBR</span>
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
