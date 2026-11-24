import React from 'react';
import type { ElectricalCategory, FurnitureCategory, StairSpec } from '../types/project';

interface FurnitureCadBlockProps {
  category: FurnitureCategory;
  x: number;
  y: number;
  width: number;
  depth: number;
  stroke: string;
  fill?: string;
  accent?: string;
  strokeWidth?: number;
  detailed?: boolean;
  stairSpec?: StairSpec;
  rotationDeg?: number;
}

/**
 * Renders authentic ABNT / AutoCAD architectural furniture & fixture symbols
 * inside the bounding box (x, y, width, depth). Works seamlessly both in
 * metric CAD coordinates (FloorPlanEditor2D) and transformed SVG pixel spaces (CadSheetPreview).
 */
export const FurnitureCadBlock: React.FC<FurnitureCadBlockProps> = ({
  category,
  x: boxX,
  y: boxY,
  width,
  depth,
  stroke,
  fill = 'none',
  accent,
  strokeWidth = 0.8,
  detailed = true,
  stairSpec,
  rotationDeg,
}) => {
  const sw = strokeWidth;
  const swThin = sw * 0.65;
  const acc = accent ?? stroke;
  const boxW = Math.max(0.01, width);
  const boxD = Math.max(0.01, depth);

  const normRot = rotationDeg !== undefined ? ((rotationDeg % 360) + 360) % 360 : 0;
  const rotRad = (normRot * Math.PI) / 180;
  const rotCos = Math.abs(Math.cos(rotRad));
  const rotSin = Math.abs(Math.sin(rotRad));
  const det = rotCos * rotCos - rotSin * rotSin;
  // Recover canonical (unrotated) item width/depth from rotated AABB
  const canonW =
    normRot === 0 || normRot === 180
      ? boxW
      : normRot === 90 || normRot === 270
        ? boxD
        : Math.abs(det) > 0.08
          ? Math.max(0.01, (boxW * rotCos - boxD * rotSin) / det)
          : boxW;
  const canonD =
    normRot === 0 || normRot === 180
      ? boxD
      : normRot === 90 || normRot === 270
        ? boxW
        : Math.abs(det) > 0.08
          ? Math.max(0.01, (boxD * rotCos - boxW * rotSin) / det)
          : boxD;

  const hasRotation = normRot !== 0;
  const x = hasRotation ? 0 : boxX;
  const y = hasRotation ? 0 : boxY;
  const w = hasRotation ? canonW : boxW;
  const d = hasRotation ? canonD : boxD;

  const renderSymbol = () => {
    switch (category) {
    case 'cama': {
      const verticalBed = d >= w;
      const isDouble = Math.min(w, d) >= 1.1;
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          {detailed && verticalBed && (
            <>
              {/* Headboard */}
              <rect x={x} y={y} width={w} height={d * 0.06} fill={stroke} fillOpacity={0.25} stroke={stroke} strokeWidth={swThin} />
              {/* Pillows */}
              {isDouble ? (
                <>
                  <rect x={x + w * 0.08} y={y + d * 0.09} width={w * 0.38} height={d * 0.16} rx={w * 0.04} fill="none" stroke={stroke} strokeWidth={swThin} />
                  <rect x={x + w * 0.54} y={y + d * 0.09} width={w * 0.38} height={d * 0.16} rx={w * 0.04} fill="none" stroke={stroke} strokeWidth={swThin} />
                </>
              ) : (
                <rect x={x + w * 0.15} y={y + d * 0.09} width={w * 0.7} height={d * 0.16} rx={w * 0.04} fill="none" stroke={stroke} strokeWidth={swThin} />
              )}
              {/* Duvet fold */}
              <line x1={x} y1={y + d * 0.36} x2={x + w} y2={y + d * 0.36} stroke={stroke} strokeWidth={swThin} />
              <polyline
                points={`${x + w * 0.72},${y + d * 0.36} ${x + w},${y + d * 0.46}`}
                fill="none"
                stroke={stroke}
                strokeWidth={swThin}
                opacity={0.75}
              />
            </>
          )}
          {detailed && !verticalBed && (
            <>
              <rect x={x} y={y} width={w * 0.06} height={d} fill={stroke} fillOpacity={0.25} stroke={stroke} strokeWidth={swThin} />
              {isDouble ? (
                <>
                  <rect x={x + w * 0.09} y={y + d * 0.08} width={w * 0.16} height={d * 0.38} rx={d * 0.04} fill="none" stroke={stroke} strokeWidth={swThin} />
                  <rect x={x + w * 0.09} y={y + d * 0.54} width={w * 0.16} height={d * 0.38} rx={d * 0.04} fill="none" stroke={stroke} strokeWidth={swThin} />
                </>
              ) : (
                <rect x={x + w * 0.09} y={y + d * 0.15} width={w * 0.16} height={d * 0.7} rx={d * 0.04} fill="none" stroke={stroke} strokeWidth={swThin} />
              )}
              <line x1={x + w * 0.36} y1={y} x2={x + w * 0.36} y2={y + d} stroke={stroke} strokeWidth={swThin} />
            </>
          )}
        </g>
      );
    }

    case 'mesa_cabeceira':
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          {detailed && (
            <>
              <circle cx={x + w / 2} cy={y + d / 2} r={Math.min(w, d) * 0.25} fill="none" stroke={acc} strokeWidth={swThin} />
              <circle cx={x + w / 2} cy={y + d / 2} r={Math.min(w, d) * 0.07} fill={acc} />
            </>
          )}
        </g>
      );

    case 'guarda_roupa':
    case 'armario':
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          {detailed && (
            <>
              <line x1={x} y1={y + d * 0.5} x2={x + w} y2={y + d * 0.5} stroke={stroke} strokeWidth={swThin} strokeDasharray={`${w * 0.08} ${w * 0.05}`} />
              <line x1={x + w * 0.08} y1={y + d * 0.18} x2={x + w * 0.52} y2={y + d * 0.18} stroke={stroke} strokeWidth={swThin} />
              <line x1={x + w * 0.48} y1={y + d * 0.82} x2={x + w * 0.92} y2={y + d * 0.82} stroke={stroke} strokeWidth={swThin} />
              <line x1={x + w * 0.5} y1={y} x2={x + w * 0.5} y2={y + d} stroke={stroke} strokeWidth={swThin} opacity={0.6} />
            </>
          )}
        </g>
      );

    case 'rack_tv':
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          {detailed && (
            <line x1={x + w * 0.06} y1={y + d * 0.35} x2={x + w * 0.94} y2={y + d * 0.35} stroke={stroke} strokeWidth={swThin} opacity={0.6} />
          )}
        </g>
      );

    case 'tv':
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={acc} fillOpacity={0.35} stroke={acc} strokeWidth={sw} />
          <line x1={x + w * 0.15} y1={y + d * 0.5} x2={x + w * 0.85} y2={y + d * 0.5} stroke={acc} strokeWidth={swThin} />
        </g>
      );

    case 'sofa': {
      const horiz = w >= d;
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} rx={Math.min(w, d) * 0.06} fill={fill} stroke={stroke} strokeWidth={sw} />
          {detailed && horiz && (
            <>
              <rect x={x + w * 0.12} y={y} width={w * 0.76} height={d * 0.24} fill="none" stroke={stroke} strokeWidth={swThin} />
              <rect x={x} y={y} width={w * 0.12} height={d} fill="none" stroke={stroke} strokeWidth={swThin} />
              <rect x={x + w * 0.88} y={y} width={w * 0.12} height={d} fill="none" stroke={stroke} strokeWidth={swThin} />
              <line x1={x + w * 0.5} y1={y + d * 0.24} x2={x + w * 0.5} y2={y + d} stroke={stroke} strokeWidth={swThin} />
            </>
          )}
          {detailed && !horiz && (
            <>
              <rect x={x} y={y + d * 0.12} width={w * 0.24} height={d * 0.76} fill="none" stroke={stroke} strokeWidth={swThin} />
              <rect x={x} y={y} width={w} height={d * 0.12} fill="none" stroke={stroke} strokeWidth={swThin} />
              <rect x={x} y={y + d * 0.88} width={w} height={d * 0.12} fill="none" stroke={stroke} strokeWidth={swThin} />
              <line x1={x + w * 0.24} y1={y + d * 0.5} x2={x + w} y2={y + d * 0.5} stroke={stroke} strokeWidth={swThin} />
            </>
          )}
        </g>
      );
    }

    case 'mesa':
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          {detailed && (
            <rect
              x={x + w * 0.06}
              y={y + d * 0.08}
              width={w * 0.88}
              height={d * 0.84}
              fill="none"
              stroke={stroke}
              strokeWidth={swThin}
              opacity={0.55}
            />
          )}
        </g>
      );

    case 'cadeira':
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} rx={w * 0.14} fill={fill} stroke={stroke} strokeWidth={sw} />
          {detailed && (
            <line x1={x + w * 0.12} y1={y + d * 0.78} x2={x + w * 0.88} y2={y + d * 0.78} stroke={stroke} strokeWidth={sw * 1.15} />
          )}
        </g>
      );

    case 'bancada': {
      const horiz = w >= d;
      const sinkX = horiz ? x + w * 0.1 : x + w * 0.16;
      const sinkY = horiz ? y + d * 0.16 : y + d * 0.1;
      const sinkW = horiz ? w * 0.34 : w * 0.68;
      const sinkD = horiz ? d * 0.68 : d * 0.34;
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          {detailed && (
            <>
              {/* Stainless Sink Bowl */}
              <rect
                x={sinkX}
                y={sinkY}
                width={sinkW}
                height={sinkD}
                rx={Math.min(sinkW, sinkD) * 0.12}
                fill="none"
                stroke={acc}
                strokeWidth={swThin}
              />
              {/* Drain hole */}
              <circle cx={sinkX + sinkW * 0.5} cy={sinkY + sinkD * 0.5} r={Math.min(sinkW, sinkD) * 0.1} fill={acc} />
              {/* Faucet spout */}
              <line
                x1={sinkX + sinkW * 0.5}
                y1={sinkY + (horiz ? 0 : sinkD * 0.12)}
                x2={sinkX + sinkW * 0.5}
                y2={sinkY + sinkD * 0.32}
                stroke={acc}
                strokeWidth={swThin * 1.3}
              />
              {/* Drainer grooves */}
              {horiz && (
                <>
                  <line x1={x + w * 0.48} y1={y + d * 0.25} x2={x + w * 0.58} y2={y + d * 0.25} stroke={stroke} strokeWidth={swThin * 0.8} opacity={0.5} />
                  <line x1={x + w * 0.48} y1={y + d * 0.5} x2={x + w * 0.58} y2={y + d * 0.5} stroke={stroke} strokeWidth={swThin * 0.8} opacity={0.5} />
                  <line x1={x + w * 0.48} y1={y + d * 0.75} x2={x + w * 0.58} y2={y + d * 0.75} stroke={stroke} strokeWidth={swThin * 0.8} opacity={0.5} />
                </>
              )}
            </>
          )}
        </g>
      );
    }

    case 'cooktop':
    case 'fogao': {
      const rB = Math.min(w, d) * 0.15;
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          {detailed && (
            <>
              <circle cx={x + w * 0.3} cy={y + d * 0.3} r={rB} fill="none" stroke={acc} strokeWidth={swThin} />
              <circle cx={x + w * 0.7} cy={y + d * 0.3} r={rB * 0.85} fill="none" stroke={acc} strokeWidth={swThin} />
              <circle cx={x + w * 0.3} cy={y + d * 0.7} r={rB * 0.85} fill="none" stroke={acc} strokeWidth={swThin} />
              <circle cx={x + w * 0.7} cy={y + d * 0.7} r={rB} fill="none" stroke={acc} strokeWidth={swThin} />
            </>
          )}
        </g>
      );
    }

    case 'geladeira':
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          {detailed && (
            <>
              <line x1={x} y1={y} x2={x + w} y2={y + d} stroke={stroke} strokeWidth={swThin} opacity={0.65} />
              <line x1={x + w * 0.12} y1={y + d * 0.9} x2={x + w * 0.88} y2={y + d * 0.9} stroke={stroke} strokeWidth={swThin} />
            </>
          )}
        </g>
      );

    case 'tanque':
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          {detailed && (
            <>
              <rect x={x + w * 0.12} y={y + d * 0.15} width={w * 0.76} height={d * 0.7} rx={w * 0.08} fill="none" stroke={acc} strokeWidth={swThin} />
              <circle cx={x + w * 0.5} cy={y + d * 0.42} r={Math.min(w, d) * 0.07} fill={acc} />
              <line x1={x + w * 0.2} y1={y + d * 0.65} x2={x + w * 0.8} y2={y + d * 0.65} stroke={stroke} strokeWidth={swThin} opacity={0.6} />
              <line x1={x + w * 0.2} y1={y + d * 0.75} x2={x + w * 0.8} y2={y + d * 0.75} stroke={stroke} strokeWidth={swThin} opacity={0.6} />
            </>
          )}
        </g>
      );

    case 'maquina_lavar':
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          {detailed && (
            <>
              <circle cx={x + w / 2} cy={y + d / 2} r={Math.min(w, d) * 0.34} fill="none" stroke={acc} strokeWidth={swThin} />
              <circle cx={x + w / 2} cy={y + d / 2} r={Math.min(w, d) * 0.2} fill="none" stroke={acc} strokeWidth={swThin} opacity={0.65} />
              <line x1={x + w * 0.12} y1={y + d * 0.12} x2={x + w * 0.88} y2={y + d * 0.12} stroke={stroke} strokeWidth={swThin} />
            </>
          )}
        </g>
      );

    case 'box':
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          {detailed && (
            <>
              {/* Floor slope X lines towards drain */}
              <line x1={x} y1={y} x2={x + w} y2={y + d} stroke={stroke} strokeWidth={swThin} opacity={0.55} />
              <line x1={x + w} y1={y} x2={x} y2={y + d} stroke={stroke} strokeWidth={swThin} opacity={0.55} />
              {/* Shower Drain circle */}
              <circle cx={x + w * 0.5} cy={y + d * 0.5} r={Math.min(w, d) * 0.08} fill="none" stroke={acc} strokeWidth={swThin} />
              {/* Tempered glass leaf line */}
              <line x1={x + w * 0.04} y1={y + d} x2={x + w * 0.96} y2={y + d} stroke={acc} strokeWidth={sw * 1.4} />
            </>
          )}
        </g>
      );

    case 'chuveiro':
      return (
        <g>
          <circle cx={x + w / 2} cy={y + d / 2} r={Math.min(w, d) * 0.38} fill="none" stroke={acc} strokeWidth={swThin} />
          <circle cx={x + w / 2} cy={y + d / 2} r={Math.min(w, d) * 0.14} fill={acc} />
        </g>
      );

    case 'vaso_sanitario': {
      const horiz = w > d;
      return (
        <g>
          {!horiz ? (
            <>
              {/* Cistern tank */}
              <rect x={x + w * 0.05} y={y} width={w * 0.9} height={d * 0.25} rx={w * 0.06} fill={fill} stroke={stroke} strokeWidth={sw} />
              {/* Bowl */}
              <ellipse cx={x + w * 0.5} cy={y + d * 0.62} rx={w * 0.42} ry={d * 0.36} fill={fill} stroke={stroke} strokeWidth={sw} />
              {detailed && (
                <ellipse cx={x + w * 0.5} cy={y + d * 0.64} rx={w * 0.26} ry={d * 0.23} fill="none" stroke={stroke} strokeWidth={swThin} />
              )}
            </>
          ) : (
            <>
              <rect x={x} y={y + d * 0.05} width={w * 0.25} height={d * 0.9} rx={d * 0.06} fill={fill} stroke={stroke} strokeWidth={sw} />
              <ellipse cx={x + w * 0.62} cy={y + d * 0.5} rx={w * 0.36} ry={d * 0.42} fill={fill} stroke={stroke} strokeWidth={sw} />
              {detailed && (
                <ellipse cx={x + w * 0.64} cy={y + d * 0.5} rx={w * 0.23} ry={d * 0.26} fill="none" stroke={stroke} strokeWidth={swThin} />
              )}
            </>
          )}
        </g>
      );
    }

    case 'lavatorio':
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          {detailed && (
            <>
              <ellipse cx={x + w / 2} cy={y + d * 0.55} rx={w * 0.35} ry={d * 0.3} fill="none" stroke={acc} strokeWidth={swThin} />
              <circle cx={x + w / 2} cy={y + d * 0.55} r={Math.min(w, d) * 0.07} fill={acc} />
              <circle cx={x + w / 2} cy={y + d * 0.16} r={Math.min(w, d) * 0.06} fill={acc} />
            </>
          )}
        </g>
      );

    case 'espelho':
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={acc} fillOpacity={0.25} stroke={acc} strokeWidth={swThin} />
        </g>
      );

    case 'escada': {
      const steps = Math.max(7, Math.min(18, stairSpec?.steps ?? 11));
      const verticalRun = d >= w;
      const treadLines: number[] = [];
      for (let i = 1; i < steps; i++) {
        treadLines.push(i / steps);
      }
      const cx = x + w / 2;
      const cy = y + d / 2;
      return (
        <g>
          <rect x={x} y={y} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          {/* Degraus */}
          {treadLines.map((t, idx) =>
            verticalRun ? (
              <line
                key={idx}
                x1={x}
                y1={y + d * t}
                x2={x + w}
                y2={y + d * t}
                stroke={stroke}
                strokeWidth={swThin}
                opacity={t > 0.65 ? 0.5 : 0.9}
              />
            ) : (
              <line
                key={idx}
                x1={x + w * t}
                y1={y}
                x2={x + w * t}
                y2={y + d}
                stroke={stroke}
                strokeWidth={swThin}
                opacity={t > 0.65 ? 0.5 : 0.9}
              />
            ),
          )}
          {/* Linha de interrupção arquitetônica e seta SOBE */}
          {detailed && (
            <>
              {verticalRun ? (
                <>
                  <line x1={x} y1={y + d * 0.66} x2={x + w} y2={y + d * 0.54} stroke={acc} strokeWidth={sw} />
                  <line x1={cx} y1={y + d * 0.88} x2={cx} y2={y + d * 0.14} stroke={acc} strokeWidth={sw} />
                  <polyline
                    points={`${cx - w * 0.18},${y + d * 0.24} ${cx},${y + d * 0.12} ${cx + w * 0.18},${y + d * 0.24}`}
                    fill="none"
                    stroke={acc}
                    strokeWidth={sw}
                  />
                  <circle cx={cx} cy={y + d * 0.88} r={Math.min(w, d) * 0.06} fill={acc} />
                </>
              ) : (
                <>
                  <line x1={x + w * 0.66} y1={y} x2={x + w * 0.54} y2={y + d} stroke={acc} strokeWidth={sw} />
                  <line x1={x + w * 0.88} y1={cy} x2={x + w * 0.14} y2={cy} stroke={acc} strokeWidth={sw} />
                  <polyline
                    points={`${x + w * 0.24},${cy - d * 0.18} ${x + w * 0.12},${cy} ${x + w * 0.24},${cy + d * 0.18}`}
                    fill="none"
                    stroke={acc}
                    strokeWidth={sw}
                  />
                  <circle cx={x + w * 0.88} cy={cy} r={Math.min(w, d) * 0.06} fill={acc} />
                </>
              )}
            </>
          )}
        </g>
      );
    }

      default:
        return <rect x={x} y={y} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />;
    }
  };

  if (!hasRotation) {
    return renderSymbol();
  }

  return (
    <g transform={`translate(${boxX + boxW / 2}, ${boxY + boxD / 2}) rotate(${normRot}) translate(${-w / 2}, ${-d / 2})`}>
      {renderSymbol()}
    </g>
  );
};

interface ElectricalSymbolSvgProps {
  category: ElectricalCategory;
  cx: number;
  cy: number;
  r: number;
  color: string;
  bg?: string;
}

/**
 * Renders ABNT NBR 5444 electrical & special telecom symbols centered at (cx, cy).
 */
export const ElectricalSymbolSvg: React.FC<ElectricalSymbolSvgProps> = ({
  category,
  cx,
  cy,
  r,
  color,
  bg = '#0B0E14',
}) => {
  const sw = Math.max(0.02, r * 0.22);

  if (category === 'iluminacao_teto') {
    return (
      <g>
        <circle cx={cx} cy={cy} r={r * 1.15} fill={bg} stroke={color} strokeWidth={sw} />
        <line x1={cx - r * 1.15} y1={cy} x2={cx + r * 1.15} y2={cy} stroke={color} strokeWidth={sw * 0.8} />
        <line x1={cx} y1={cy - r * 1.15} x2={cx} y2={cy + r * 1.15} stroke={color} strokeWidth={sw * 0.8} />
      </g>
    );
  }
  if (category === 'interruptor') {
    return (
      <g>
        <circle cx={cx} cy={cy} r={r * 0.85} fill={bg} stroke={color} strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={r * 0.25} fill={color} />
      </g>
    );
  }
  if (category === 'cftv') {
    // Camera box + FOV coverage cone
    return (
      <g>
        <polygon
          points={`${cx},${cy} ${cx + r * 3.4},${cy + r * 1.6} ${cx + r * 1.6},${cy + r * 3.4}`}
          fill={color}
          fillOpacity={0.14}
          stroke={color}
          strokeDasharray={`${r * 0.45} ${r * 0.3}`}
          strokeWidth={sw * 0.7}
        />
        <rect x={cx - r * 0.9} y={cy - r * 0.65} width={r * 1.8} height={r * 1.3} rx={r * 0.25} fill={color} />
        <circle cx={cx + r * 0.4} cy={cy} r={r * 0.3} fill={bg} />
      </g>
    );
  }
  if (category === 'wifi_ap') {
    return (
      <g>
        <circle cx={cx} cy={cy} r={r * 0.45} fill={color} />
        <path
          d={`M ${cx - r * 1.0} ${cy - r * 0.35} A ${r * 1.0} ${r * 1.0} 0 0 1 ${cx + r * 1.0} ${cy - r * 0.35}`}
          fill="none"
          stroke={color}
          strokeWidth={sw}
        />
        <path
          d={`M ${cx - r * 1.55} ${cy - r * 0.65} A ${r * 1.55} ${r * 1.55} 0 0 1 ${cx + r * 1.55} ${cy - r * 0.65}`}
          fill="none"
          stroke={color}
          strokeWidth={sw * 0.85}
        />
      </g>
    );
  }
  if (category === 'antena_tv' || category === 'tv') {
    return (
      <g>
        <polygon
          points={`${cx - r * 1.1},${cy + r * 0.9} ${cx + r * 1.1},${cy + r * 0.9} ${cx},${cy - r * 1.0}`}
          fill={bg}
          stroke={color}
          strokeWidth={sw}
        />
        <line x1={cx - r * 0.6} y1={cy - r * 0.9} x2={cx + r * 0.6} y2={cy - r * 0.9} stroke={color} strokeWidth={sw} />
      </g>
    );
  }
  if (category === 'dados' || category === 'rack_ti') {
    return (
      <g>
        <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={bg} stroke={color} strokeWidth={sw} />
        <polygon points={`${cx - r * 0.7},${cy + r * 0.6} ${cx + r * 0.7},${cy + r * 0.6} ${cx},${cy - r * 0.65}`} fill={color} />
      </g>
    );
  }
  if (category === 'quadro_luz') {
    const rw = r * 2.1;
    const rh = r * 1.25;
    return (
      <g>
        <rect x={cx - rw} y={cy - rh} width={rw * 2} height={rh * 2} fill={bg} stroke={color} strokeWidth={sw * 1.1} />
        <polygon
          points={`${cx - rw},${cy - rh} ${cx + rw},${cy - rh} ${cx - rw},${cy + rh}`}
          fill={color}
        />
      </g>
    );
  }
  if (category === 'interfone') {
    return (
      <g>
        <rect x={cx - r * 0.85} y={cy - r * 0.95} width={r * 1.7} height={r * 1.9} rx={r * 0.25} fill={bg} stroke={color} strokeWidth={sw} />
        <circle cx={cx} cy={cy - r * 0.25} r={r * 0.35} fill={color} />
      </g>
    );
  }
  // Standard Power Socket (Triângulo NBR 5444)
  const filled = category === 'tomada_alta' || category === 'ar_condicionado' || category === 'chuveiro';
  const half = category === 'tomada_media';
  return (
    <g>
      <polygon
        points={`${cx},${cy - r * 1.1} ${cx + r * 1.0},${cy + r * 0.8} ${cx - r * 1.0},${cy + r * 0.8}`}
        fill={filled ? color : bg}
        stroke={color}
        strokeWidth={sw}
      />
      {half && (
        <polygon
          points={`${cx},${cy - r * 1.1} ${cx + r * 1.0},${cy + r * 0.8} ${cx},${cy + r * 0.8}`}
          fill={color}
        />
      )}
    </g>
  );
};
