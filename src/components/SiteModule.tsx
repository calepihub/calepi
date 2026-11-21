import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  Plus,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import {
  analyzeSiteGeometry,
  buildSiteVerticesFromDimensions,
  checkImplantationFeasibility,
  getBoundingBox,
  round2,
} from '../engine/geometry';
import { nextId } from '../engine/parametricGenerator';
import type {
  Floor,
  Point2D,
  Project,
  SiteShapeType,
  TopographyType,
  UnitInstance,
} from '../types/project';

interface SiteModuleProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
}

export const SiteModule: React.FC<SiteModuleProps> = ({ project, onUpdateProject }) => {
  const [selectedFloorId, setSelectedFloorId] = useState<string>(project.floors[0]?.id ?? '');
  const [draggingVertexIdx, setDraggingVertexIdx] = useState<number | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const surveyInputRef = useRef<HTMLInputElement>(null);

  const site = project.site;
  const siteCheck = analyzeSiteGeometry(site);
  const activeFloor =
    project.floors.find((f) => f.id === selectedFloorId) ?? project.floors[0];
  const feasibility = activeFloor
    ? checkImplantationFeasibility(site, activeFloor.units, project.unitTypes)
    : null;

  const updateSiteDimensions = (patch: Partial<typeof site>, rebuildVertices = true) => {
    onUpdateProject((prev) => {
      const nextSite = { ...prev.site, ...patch };
      if (rebuildVertices && nextSite.shapeType !== 'irregular' && nextSite.shapeType !== 'poligonal') {
        const back = nextSite.shapeType === 'retangular' || nextSite.shapeType === 'quadrado'
          ? nextSite.front
          : nextSite.back;
        const right = nextSite.shapeType === 'retangular' || nextSite.shapeType === 'quadrado'
          ? nextSite.leftDepth
          : nextSite.rightDepth;
        const depth = nextSite.shapeType === 'quadrado' ? nextSite.front : nextSite.leftDepth;
        nextSite.back = back;
        nextSite.leftDepth = depth;
        nextSite.rightDepth = nextSite.shapeType === 'quadrado' ? nextSite.front : right;
        nextSite.vertices = buildSiteVerticesFromDimensions(
          nextSite.front,
          nextSite.back,
          nextSite.leftDepth,
          nextSite.rightDepth,
        );
      }
      return { ...prev, site: nextSite };
    });
  };

  // SVG viewport mapping
  const bbox = getBoundingBox(site.vertices);
  const pad = 3.5;
  const minX = bbox.minX - pad;
  const minY = bbox.minY - pad;
  const viewW = Math.max(10, bbox.width + pad * 2);
  const viewH = Math.max(10, bbox.depth + pad * 2);

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingVertexIdx === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const rx = ((e.clientX - rect.left) / rect.width) * viewW + minX;
    const ry = ((e.clientY - rect.top) / rect.height) * viewH + minY;
    const snappedX = round2(Math.round(rx * 4) / 4);
    const snappedY = round2(Math.round(ry * 4) / 4);

    onUpdateProject((prev) => {
      const nextVerts = prev.site.vertices.map((v, idx) =>
        idx === draggingVertexIdx ? { x: snappedX, y: snappedY } : v,
      );
      return {
        ...prev,
        site: {
          ...prev.site,
          shapeType: 'poligonal',
          vertices: nextVerts,
        },
      };
    });
  };

  const handleAddFloor = () => {
    onUpdateProject((prev) => {
      const idx = prev.floors.length;
      const prevTop = prev.floors.reduce((acc, f) => acc + f.floorToFloorHeight, 0);
      const newFloor: Floor = {
        id: nextId('fl'),
        levelIndex: idx,
        name: `${idx}º Pavimento`,
        elevation: round2(prevTop),
        floorToFloorHeight: 2.95,
        slabThickness: 0.15,
        corridorWidth: 1.5,
        commonAreaM2: prev.floors[0]?.commonAreaM2 ?? 20,
        units: [],
        extraWalls: [],
        extraOpenings: [],
      };
      setSelectedFloorId(newFloor.id);
      return { ...prev, floors: [...prev.floors, newFloor] };
    }, 'Adição de novo pavimento');
  };

  const handleAddUnitToFloor = (unitTypeId: string) => {
    if (!activeFloor) return;
    const ut = project.unitTypes.find((t) => t.id === unitTypeId);
    if (!ut) return;

    onUpdateProject((prev) => {
      const fl = prev.floors.find((f) => f.id === activeFloor.id);
      if (!fl) return prev;
      const num = `${fl.levelIndex + 1}${String(fl.units.length + 1).padStart(2, '0')}`;
      const b = siteCheck.buildableBox;
      // Find simple free Y offset
      const lastY = fl.units.reduce((m, u) => Math.max(m, u.y + 5), b.y);
      const nextUnit: UnitInstance = {
        id: nextId('inst'),
        unitNumber: num,
        unitTypeId,
        floorId: fl.id,
        x: b.x,
        y: lastY + ut.depth <= b.y + b.depth ? lastY : b.y,
        rotationDeg: 0,
        mirrored: false,
      };
      return {
        ...prev,
        floors: prev.floors.map((f) =>
          f.id === fl.id ? { ...f, units: [...f.units, nextUnit] } : f,
        ),
      };
    });
  };

  const handleAutoDistributeFloor = () => {
    if (!activeFloor) return;
    onUpdateProject((prev) => {
      const b = analyzeSiteGeometry(prev.site).buildableBox;
      const fl = prev.floors.find((f) => f.id === activeFloor.id);
      if (!fl) return prev;
      if (prev.unitTypes.length === 0) return prev;

      const corridorW = Math.max(1.2, fl.corridorWidth);

      // If floor has no units yet, auto-populate with the primary typology fitting inside buildableBox
      if (fl.units.length === 0) {
        const ut = prev.unitTypes[0];
        const twoColumnsFit = ut.width * 2 + corridorW <= b.width + 0.05;
        const rowsPerCol = Math.max(1, Math.floor(b.depth / ut.depth));
        const generated: UnitInstance[] = [];
        let seq = 1;

        for (let r = 0; r < rowsPerCol; r++) {
          const yPos = round2(b.y + r * ut.depth);
          generated.push({
            id: nextId('inst'),
            unitNumber: `${fl.levelIndex + 1}${String(seq++).padStart(2, '0')}`,
            unitTypeId: ut.id,
            floorId: fl.id,
            x: round2(b.x),
            y: yPos,
            rotationDeg: 0,
            mirrored: false,
          });
          if (twoColumnsFit) {
            generated.push({
              id: nextId('inst'),
              unitNumber: `${fl.levelIndex + 1}${String(seq++).padStart(2, '0')}`,
              unitTypeId: ut.id,
              floorId: fl.id,
              x: round2(b.x + ut.width + corridorW),
              y: yPos,
              rotationDeg: 0,
              mirrored: true,
            });
          }
        }

        const nextCommon = round2(corridorW * Math.min(b.depth, rowsPerCol * ut.depth));
        return {
          ...prev,
          floors: prev.floors.map((f) =>
            f.id === fl.id ? { ...f, units: generated, commonAreaM2: Math.max(f.commonAreaM2, nextCommon) } : f,
          ),
        };
      }

      let leftY = b.y;
      let rightY = b.y;

      const arranged = fl.units.map((inst, idx) => {
        const ut = prev.unitTypes.find((t) => t.id === inst.unitTypeId);
        const uW = ut?.width ?? 4.0;
        const uD = ut?.depth ?? 5.0;
        const isLeft = idx % 2 === 0;
        if (isLeft) {
          const placed = { ...inst, x: round2(b.x), y: round2(leftY), mirrored: false, rotationDeg: 0 };
          leftY += uD;
          return placed;
        } else {
          const rightX = round2(b.x + uW + corridorW);
          const placed = { ...inst, x: rightX, y: round2(rightY), mirrored: true, rotationDeg: 0 };
          rightY += uD;
          return placed;
        }
      });

      return {
        ...prev,
        floors: prev.floors.map((f) => (f.id === fl.id ? { ...f, units: arranged } : f)),
      };
    }, `Auto-distribuição de unidades no ${activeFloor.name}`);
  };

  const handleImportSurvey = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      let points: Point2D[] = [];
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(txt);
        if (Array.isArray(parsed)) {
          points = parsed.filter((p) => typeof p.x === 'number' && typeof p.y === 'number');
        }
      } else {
        // CSV / TXT with x,y per line
        points = txt
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            const [xs, ys] = l.split(/[;,\s]+/);
            return { x: Number(xs), y: Number(ys) };
          })
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      }

      if (points.length < 3) {
        setImportMsg('Arquivo não contém ao menos 3 vértices válidos (x, y).');
        return;
      }
      onUpdateProject((prev) => ({
        ...prev,
        site: {
          ...prev.site,
          shapeType: 'poligonal',
          vertices: points,
        },
      }), 'Importação de levantamento topográfico (vértices)');
      setImportMsg(`Levantamento importado com ${points.length} vértices.`);
    } catch {
      setImportMsg('Erro ao processar arquivo de levantamento.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2A2F38] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-white">
            Cadastro Geométrico do Terreno & Pavimentos
          </h1>
          <p className="text-xs text-[#949BA8] mt-1">
            Defina medidas, geometria poligonal, recuos, topografia e implantação das unidades por pavimento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={surveyInputRef}
            type="file"
            accept=".csv,.txt,.json"
            onChange={handleImportSurvey}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => surveyInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-[#323844] bg-[#1E222A] text-[#E6E9EF] hover:bg-[#262B35]"
          >
            <Upload className="w-3.5 h-3.5" />
            Importar Vértices (CSV/JSON)
          </button>
        </div>
      </div>

      {importMsg && (
        <div className="p-2.5 rounded border border-[#2F7CF6]/40 bg-[#2F7CF6]/10 text-xs text-[#E6E9EF]">
          {importMsg}
        </div>
      )}

      {/* Alerts for area divergence or implantation bounds */}
      {siteCheck.hasAreaDivergence && (
        <div className="p-3 rounded border border-amber-500/40 bg-amber-950/30 text-amber-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            Divergência detectada: Área declarada ({siteCheck.declaredArea} m²) difere em{' '}
            <strong className="font-mono">{siteCheck.areaDivergenceM2} m²</strong> da área calculada pela geometria ({siteCheck.calculatedArea} m²). Os cálculos adotam a geometria real.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Site Parameters */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-4">
            <h2 className="text-sm font-semibold text-white">Geometria e Dimensões</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Formato do Lote</label>
                <select
                  value={site.shapeType}
                  onChange={(e) =>
                    updateSiteDimensions({ shapeType: e.target.value as SiteShapeType }, true)
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                >
                  <option value="retangular">Retangular</option>
                  <option value="quadrado">Quadrado</option>
                  <option value="trapezoidal">Trapezoidal</option>
                  <option value="irregular">Irregular (4 vértices)</option>
                  <option value="poligonal">Poligonal Livre</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Área Informada / Matrícula (m²)</label>
                <input
                  type="number"
                  step="0.1"
                  value={site.declaredArea}
                  onChange={(e) =>
                    updateSiteDimensions({ declaredArea: Number(e.target.value) }, false)
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Frente (m)</label>
                <input
                  type="number"
                  step="0.1"
                  min={2}
                  value={site.front}
                  onChange={(e) => updateSiteDimensions({ front: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Fundos (m)</label>
                <input
                  type="number"
                  step="0.1"
                  min={2}
                  disabled={site.shapeType === 'retangular' || site.shapeType === 'quadrado'}
                  value={site.back}
                  onChange={(e) => updateSiteDimensions({ back: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Lat. Esq (m)</label>
                <input
                  type="number"
                  step="0.1"
                  min={2}
                  disabled={site.shapeType === 'quadrado'}
                  value={site.leftDepth}
                  onChange={(e) => updateSiteDimensions({ leftDepth: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Lat. Dir (m)</label>
                <input
                  type="number"
                  step="0.1"
                  min={2}
                  disabled={site.shapeType === 'retangular' || site.shapeType === 'quadrado'}
                  value={site.rightDepth}
                  onChange={(e) => updateSiteDimensions({ rightDepth: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white disabled:opacity-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-[#2A2F38] text-xs font-mono tabular-nums">
              <div>
                <div className="text-[11px] text-[#949BA8]">Área Geométrica</div>
                <div className="text-white font-semibold">{siteCheck.calculatedArea} m²</div>
              </div>
              <div>
                <div className="text-[11px] text-[#949BA8]">Perímetro</div>
                <div className="text-white font-semibold">{siteCheck.calculatedPerimeter} m</div>
              </div>
              <div>
                <div className="text-[11px] text-[#949BA8]">Área Edificável</div>
                <div className="text-white font-semibold">{siteCheck.buildableBox.area} m²</div>
              </div>
            </div>
          </div>

          {/* Recuos, Topografia e Orientação */}
          <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-4">
            <h2 className="text-sm font-semibold text-white">Recuos, Topografia & Orientação</h2>

            <div className="grid grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Rec. Frontal</label>
                <input
                  type="number"
                  step="0.25"
                  min={0}
                  value={site.setbacks.front}
                  onChange={(e) =>
                    updateSiteDimensions(
                      { setbacks: { ...site.setbacks, front: Number(e.target.value) } },
                      false,
                    )
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Rec. Fundos</label>
                <input
                  type="number"
                  step="0.25"
                  min={0}
                  value={site.setbacks.back}
                  onChange={(e) =>
                    updateSiteDimensions(
                      { setbacks: { ...site.setbacks, back: Number(e.target.value) } },
                      false,
                    )
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Rec. Esq.</label>
                <input
                  type="number"
                  step="0.25"
                  min={0}
                  value={site.setbacks.left}
                  onChange={(e) =>
                    updateSiteDimensions(
                      { setbacks: { ...site.setbacks, left: Number(e.target.value) } },
                      false,
                    )
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Rec. Dir.</label>
                <input
                  type="number"
                  step="0.25"
                  min={0}
                  value={site.setbacks.right}
                  onChange={(e) =>
                    updateSiteDimensions(
                      { setbacks: { ...site.setbacks, right: Number(e.target.value) } },
                      false,
                    )
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Topografia</label>
                <select
                  value={site.topography}
                  onChange={(e) =>
                    updateSiteDimensions({ topography: e.target.value as TopographyType }, false)
                  }
                  className="w-full px-2 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                >
                  <option value="plano">Plano</option>
                  <option value="aclive">Aclive</option>
                  <option value="declive">Declive</option>
                  <option value="irregular">Irregular</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Desnível (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={site.levelDifference}
                  onChange={(e) =>
                    updateSiteDimensions({ levelDifference: Number(e.target.value) }, false)
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Inclinação (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={site.slopePercent}
                  onChange={(e) =>
                    updateSiteDimensions({ slopePercent: Number(e.target.value) }, false)
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Norte (°)</label>
                <input
                  type="number"
                  step="5"
                  min={0}
                  max={359}
                  value={site.orientationDeg}
                  onChange={(e) =>
                    updateSiteDimensions({ orientationDeg: Number(e.target.value) }, false)
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Área Servidão (m²)</label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={site.easementArea}
                  onChange={(e) =>
                    updateSiteDimensions({ easementArea: Number(e.target.value) }, false)
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Restrições</label>
                <input
                  type="text"
                  value={site.restrictions}
                  onChange={(e) =>
                    updateSiteDimensions({ restrictions: e.target.value }, false)
                  }
                  className="w-full px-2 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
            </div>
          </div>

          {/* Polygon Vertices Editor */}
          <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">
                Vértices do Polígono ({site.vertices.length})
              </h2>
              <button
                type="button"
                onClick={() =>
                  onUpdateProject((prev) => {
                    const last = prev.site.vertices[prev.site.vertices.length - 1] ?? { x: 0, y: 0 };
                    return {
                      ...prev,
                      site: {
                        ...prev.site,
                        shapeType: 'poligonal',
                        vertices: [...prev.site.vertices, { x: round2(last.x - 1), y: round2(last.y + 1) }],
                      },
                    };
                  })
                }
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-[#22262E] border border-[#323844] text-white hover:border-[#2F7CF6]"
              >
                <Plus className="w-3 h-3" />
                Vértice
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1.5">
              {site.vertices.map((v, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-[#949BA8] w-7">V{idx + 1}</span>
                  <input
                    type="number"
                    step="0.25"
                    value={v.x}
                    aria-label={`Vértice ${idx + 1} X`}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onUpdateProject((prev) => ({
                        ...prev,
                        site: {
                          ...prev.site,
                          shapeType: 'poligonal',
                          vertices: prev.site.vertices.map((pt, i) =>
                            i === idx ? { ...pt, x: val } : pt,
                          ),
                        },
                      }));
                    }}
                    className="w-24 px-2 py-1 font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                  />
                  <input
                    type="number"
                    step="0.25"
                    value={v.y}
                    aria-label={`Vértice ${idx + 1} Y`}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onUpdateProject((prev) => ({
                        ...prev,
                        site: {
                          ...prev.site,
                          shapeType: 'poligonal',
                          vertices: prev.site.vertices.map((pt, i) =>
                            i === idx ? { ...pt, y: val } : pt,
                          ),
                        },
                      }));
                    }}
                    className="w-24 px-2 py-1 font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                  />
                  {site.vertices.length > 3 && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateProject((prev) => ({
                          ...prev,
                          site: {
                            ...prev.site,
                            shapeType: 'poligonal',
                            vertices: prev.site.vertices.filter((_, i) => i !== idx),
                          },
                        }))
                      }
                      aria-label={`Remover vértice ${idx + 1}`}
                      className="p-1 text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Interactive 2D Site & Implantation Canvas + Floor Manager */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">
                  Representação 2D do Terreno & Implantação
                </h2>
                <span className="text-xs text-[#949BA8] flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5" />
                  Norte {site.orientationDeg}°
                </span>
              </div>
              {feasibility && (
                <div
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                    feasibility.fitsInBuildableArea ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {feasibility.fitsInBuildableArea ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Viabilidade geométrica OK (TO: {feasibility.occupancyRatePercent}%)
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Incompatibilidade geométrica detectada
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="bg-[#111317] border border-[#2A2F38] rounded overflow-hidden">
              <svg
                ref={svgRef}
                viewBox={`${minX} ${minY} ${viewW} ${viewH}`}
                className="w-full h-[380px] select-none cursor-crosshair"
                onPointerMove={handleSvgPointerMove}
                onPointerUp={() => setDraggingVertexIdx(null)}
                onPointerLeave={() => setDraggingVertexIdx(null)}
              >
                {/* Background Grid 1m */}
                <defs>
                  <pattern id="siteGrid" width="1" height="1" patternUnits="userSpaceOnUse">
                    <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#1E232B" strokeWidth="0.04" />
                  </pattern>
                </defs>
                <rect x={minX} y={minY} width={viewW} height={viewH} fill="url(#siteGrid)" />

                {/* Site Polygon */}
                <polygon
                  points={site.vertices.map((v) => `${v.x},${v.y}`).join(' ')}
                  fill="#1C222B"
                  stroke="#60A5FA"
                  strokeWidth="0.14"
                />

                {/* Buildable Envelope (Setbacks) */}
                {siteCheck.buildableBox.width > 0 && siteCheck.buildableBox.depth > 0 && (
                  <rect
                    x={siteCheck.buildableBox.x}
                    y={siteCheck.buildableBox.y}
                    width={siteCheck.buildableBox.width}
                    height={siteCheck.buildableBox.depth}
                    fill="#2F7CF6"
                    fillOpacity="0.06"
                    stroke="#F59E0B"
                    strokeDasharray="0.35 0.2"
                    strokeWidth="0.08"
                  />
                )}

                {/* Units on Active Floor */}
                {activeFloor?.units.map((inst) => {
                  const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
                  if (!ut) return null;
                  const out = feasibility?.outOfBoundsUnitIds.includes(inst.id);
                  return (
                    <g key={inst.id} transform={`translate(${inst.x}, ${inst.y})`}>
                      <rect
                        width={ut.width}
                        height={ut.depth}
                        fill={out ? '#EF4444' : '#2F7CF6'}
                        fillOpacity="0.22"
                        stroke={out ? '#EF4444' : '#93C5FD'}
                        strokeWidth="0.08"
                      />
                      <text
                        x={ut.width / 2}
                        y={ut.depth / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#F1F4F9"
                        fontSize="0.55"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {inst.unitNumber} ({ut.code})
                      </text>
                    </g>
                  );
                })}

                {/* Interactive Vertices */}
                {site.vertices.map((v, idx) => (
                  <g
                    key={idx}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setDraggingVertexIdx(idx);
                    }}
                    className="cursor-grab"
                  >
                    <circle cx={v.x} cy={v.y} r="0.35" fill="#60A5FA" stroke="#111317" strokeWidth="0.08" />
                    <text x={v.x + 0.45} y={v.y - 0.35} fill="#949BA8" fontSize="0.55">
                      V{idx + 1}
                    </text>
                  </g>
                ))}

                {/* North Indicator */}
                <g transform={`translate(${minX + viewW - 1.8}, ${minY + 1.8}) rotate(${site.orientationDeg})`}>
                  <circle cx="0" cy="0" r="0.9" fill="none" stroke="#6B7280" strokeWidth="0.06" />
                  <polygon points="0,-0.75 -0.25,0.3 0,0.1 0.25,0.3" fill="#F59E0B" />
                  <text x="0" y="-1.05" textAnchor="middle" fill="#F59E0B" fontSize="0.5">
                    N
                  </text>
                </g>
              </svg>
            </div>
            <p className="text-[11px] text-[#949BA8]">
              Dica: arraste os vértices azuis no desenho para modelar terrenos irregulares/poligonais. A viabilidade geométrica verifica apenas limites físicos e recuos — não implica aprovação legal municipal.
            </p>
          </div>

          {/* Floors & Units Management */}
          <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {project.floors.map((fl) => (
                  <button
                    key={fl.id}
                    type="button"
                    onClick={() => setSelectedFloorId(fl.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                      activeFloor?.id === fl.id
                        ? 'bg-[#2F7CF6] text-white'
                        : 'bg-[#14161A] border border-[#2A2F38] text-[#949BA8] hover:text-white'
                    }`}
                  >
                    {fl.name} ({fl.units.length})
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleAddFloor}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-[#323844] text-[#C4C9D4] hover:text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Pavimento
                </button>
              </div>

              <button
                type="button"
                disabled={project.unitTypes.length === 0}
                onClick={handleAutoDistributeFloor}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#22262E] border border-[#323844] text-white hover:border-[#2F7CF6] disabled:opacity-40"
              >
                <Wand2 className="w-3.5 h-3.5 text-[#2F7CF6]" />
                Auto-Distribuir Unidades
              </button>
            </div>

            {activeFloor && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#2A2F38]">
                  <div>
                    <label className="block text-[11px] text-[#949BA8] mb-1">Nome Pavimento</label>
                    <input
                      type="text"
                      value={activeFloor.name}
                      onChange={(e) =>
                        onUpdateProject((prev) => ({
                          ...prev,
                          floors: prev.floors.map((f) =>
                            f.id === activeFloor.id ? { ...f, name: e.target.value } : f,
                          ),
                        }))
                      }
                      className="w-full px-2 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#949BA8] mb-1">Pé-direito Piso-Piso (m)</label>
                    <input
                      type="number"
                      step="0.05"
                      min={2.4}
                      value={activeFloor.floorToFloorHeight}
                      onChange={(e) =>
                        onUpdateProject((prev) => ({
                          ...prev,
                          floors: prev.floors.map((f) =>
                            f.id === activeFloor.id
                              ? { ...f, floorToFloorHeight: Number(e.target.value) }
                              : f,
                          ),
                        }))
                      }
                      className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#949BA8] mb-1">Corredor Comum (m)</label>
                    <input
                      type="number"
                      step="0.1"
                      min={0.9}
                      value={activeFloor.corridorWidth}
                      onChange={(e) =>
                        onUpdateProject((prev) => ({
                          ...prev,
                          floors: prev.floors.map((f) =>
                            f.id === activeFloor.id
                              ? { ...f, corridorWidth: Number(e.target.value) }
                              : f,
                          ),
                        }))
                      }
                      className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#949BA8] mb-1">Área Comum (m²)</label>
                    <input
                      type="number"
                      step="1"
                      min={0}
                      value={activeFloor.commonAreaM2}
                      onChange={(e) =>
                        onUpdateProject((prev) => ({
                          ...prev,
                          floors: prev.floors.map((f) =>
                            f.id === activeFloor.id
                              ? { ...f, commonAreaM2: Number(e.target.value) }
                              : f,
                          ),
                        }))
                      }
                      className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                    />
                  </div>
                </div>

                {/* Add unit buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[#949BA8]">Inserir unidade no pavimento:</span>
                  {project.unitTypes.length === 0 ? (
                    <span className="text-xs text-amber-300">
                      Nenhuma tipologia cadastrada — crie uma tipologia na etapa &quot;Planta 2D & Tipologias&quot; primeiro.
                    </span>
                  ) : (
                    project.unitTypes.map((ut) => (
                      <button
                        key={ut.id}
                        type="button"
                        onClick={() => handleAddUnitToFloor(ut.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-[#14161A] border border-[#323844] text-white hover:border-[#2F7CF6]"
                      >
                        <Plus className="w-3 h-3 text-[#2F7CF6]" />
                        {ut.code} ({ut.targetArea}m²)
                      </button>
                    ))
                  )}
                </div>

                {/* Units table */}
                <div className="max-h-48 overflow-y-auto border border-[#2A2F38] rounded">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#181B20] text-[11px] text-[#949BA8]">
                      <tr>
                        <th className="py-2 px-3">Unid.</th>
                        <th className="py-2 px-3">Tipologia</th>
                        <th className="py-2 px-3">X (m)</th>
                        <th className="py-2 px-3">Y (m)</th>
                        <th className="py-2 px-3">Espelhada</th>
                        <th className="py-2 px-3 text-right">Remover</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#252A33]">
                      {activeFloor.units.map((inst) => {
                        const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
                        return (
                          <tr key={inst.id}>
                            <td className="py-1.5 px-3 font-mono">{inst.unitNumber}</td>
                            <td className="py-1.5 px-3">{ut?.code ?? 'N/I'}</td>
                            <td className="py-1.5 px-3">
                              <input
                                type="number"
                                step="0.25"
                                value={inst.x}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  onUpdateProject((prev) => ({
                                    ...prev,
                                    floors: prev.floors.map((f) =>
                                      f.id === activeFloor.id
                                        ? {
                                            ...f,
                                            units: f.units.map((u) =>
                                              u.id === inst.id ? { ...u, x: val } : u,
                                            ),
                                          }
                                        : f,
                                    ),
                                  }));
                                }}
                                className="w-16 px-1.5 py-0.5 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                              />
                            </td>
                            <td className="py-1.5 px-3">
                              <input
                                type="number"
                                step="0.25"
                                value={inst.y}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  onUpdateProject((prev) => ({
                                    ...prev,
                                    floors: prev.floors.map((f) =>
                                      f.id === activeFloor.id
                                        ? {
                                            ...f,
                                            units: f.units.map((u) =>
                                              u.id === inst.id ? { ...u, y: val } : u,
                                            ),
                                          }
                                        : f,
                                    ),
                                  }));
                                }}
                                className="w-16 px-1.5 py-0.5 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                              />
                            </td>
                            <td className="py-1.5 px-3">
                              <input
                                type="checkbox"
                                checked={inst.mirrored}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  onUpdateProject((prev) => ({
                                    ...prev,
                                    floors: prev.floors.map((f) =>
                                      f.id === activeFloor.id
                                        ? {
                                            ...f,
                                            units: f.units.map((u) =>
                                              u.id === inst.id ? { ...u, mirrored: checked } : u,
                                            ),
                                          }
                                        : f,
                                    ),
                                  }));
                                }}
                              />
                            </td>
                            <td className="py-1.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateProject((prev) => ({
                                    ...prev,
                                    floors: prev.floors.map((f) =>
                                      f.id === activeFloor.id
                                        ? {
                                            ...f,
                                            units: f.units.filter((u) => u.id !== inst.id),
                                          }
                                        : f,
                                    ),
                                  }))
                                }
                                aria-label={`Remover unidade ${inst.unitNumber}`}
                                className="p-1 text-red-400 hover:text-red-300"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
