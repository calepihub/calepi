import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Send,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { auth } from '../firebase';
import { round2 } from '../engine/geometry';
import { generateParametricUnitLayout, nextId } from '../engine/parametricGenerator';
import type { EntrySide, InternalPartitionType, Project, UnitType } from '../types/project';

interface AssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  project: Project;
  onAuthorizeTypology: (unitType: UnitType) => void;
}

interface AssistantProposal {
  name: string;
  targetArea: number;
  width: number;
  depth: number;
  ceilingHeight?: number;
  bedrooms: number;
  bathrooms: number;
  hasLaundry: boolean;
  hasBalcony: boolean;
  hasMezzanine?: boolean;
  accessible: boolean;
  entrySide?: 'frente' | 'fundo' | 'esquerda' | 'direita';
  internalPartitionType?: 'aberta_studio' | 'divisoria_parcial' | 'quarto_fechado';
}

interface AssistantResponse {
  answer: string;
  applyTypologyProposal?: boolean;
  proposedTypology?: AssistantProposal;
  warnings?: string[];
}

export const AssistantDrawer: React.FC<AssistantDrawerProps> = ({
  open,
  onClose,
  project,
  onAuthorizeTypology,
}) => {
  const [drawerTab, setDrawerTab] = useState<'ia' | 'local'>('ia');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AssistantResponse | null>(null);
  const [appliedBanner, setAppliedBanner] = useState<string | null>(null);
  const [answerPage, setAnswerPage] = useState(0);

  // Offline deterministic quick-builder state (works when AI is unavailable)
  const [offlineW, setOfflineW] = useState(4.0);
  const [offlineD, setOfflineD] = useState(6.25);
  const [offlineBalcony, setOfflineBalcony] = useState(true);
  const [offlineLaundry, setOfflineLaundry] = useState(true);
  const [offlineMezzanine, setOfflineMezzanine] = useState(false);

  if (!open) return null;

  const projectSummary = {
    name: project.name,
    municipality: project.municipality,
    state: project.state,
    siteDimensions: `${project.site.front}m x ${project.site.leftDepth}m`,
    constructionMethod: project.constructionMethod.name,
    floorsCount: project.floors.length,
    unitTypes: project.unitTypes.map((u) => ({
      code: u.code,
      name: u.name,
      area: round2(u.width * u.depth),
      dimensions: `${u.width}x${u.depth}m`,
      hasMezzanine: Boolean(u.hasMezzanine),
    })),
  };

  const askAssistant = async (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setLoading(true);
    setErrorMsg(null);
    setAppliedBanner(null);
    setAnswerPage(0);
    try {
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const resp = await fetch('/api/assistant', {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt: clean, projectSummary }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setErrorMsg(data.error || 'Serviço de IA indisponível no momento.');
        setResult(null);
      } else {
        setResult(data as AssistantResponse);
      }
    } catch {
      setErrorMsg(
        'Não foi possível conectar ao serviço de IA. Utilize a aba Gerador Paramétrico Local.',
      );
    } finally {
      setLoading(false);
    }
  };

  const buildUnitFromProposal = (prop: AssistantProposal): UnitType => {
    const code = `TIPO-${String.fromCharCode(65 + project.unitTypes.length)}`;
    const hasMezzanine = Boolean(prop.hasMezzanine);
    const rawEntry = String(prop.entrySide ?? '').toLowerCase();
    const validEntry: EntrySide =
      rawEntry === 'lateral_direita' || rawEntry === 'direita'
        ? 'lateral_direita'
        : rawEntry === 'lateral_esquerda' || rawEntry === 'esquerda'
          ? 'lateral_esquerda'
          : 'frente';

    const rawPartition = String(prop.internalPartitionType ?? '').toLowerCase();
    const validPartition: InternalPartitionType | undefined =
      rawPartition === 'drywall' || rawPartition === 'divisoria_parcial'
        ? 'drywall'
        : rawPartition === 'alvenaria' || rawPartition === 'quarto_fechado'
          ? 'alvenaria'
          : undefined;

    return generateParametricUnitLayout({
      id: nextId('ut'),
      code,
      name: prop.name || `Kitnet ${round2(prop.width * prop.depth)} m²`,
      width: Math.max(3.0, prop.width || 4.0),
      depth: Math.max(4.0, prop.depth || 6.25),
      ceilingHeight: prop.ceilingHeight
        ? Math.max(2.5, Math.min(6.0, prop.ceilingHeight))
        : hasMezzanine
          ? 4.4
          : 2.7,
      bedrooms: prop.bedrooms ?? 0,
      hasLaundry: Boolean(prop.hasLaundry),
      hasBalcony: Boolean(prop.hasBalcony),
      hasMezzanine,
      accessible: Boolean(prop.accessible),
      entrySide: validEntry,
      internalPartitionType: validPartition,
      extWallThickness: project.constructionMethod.externalWallThickness,
      intWallThickness: project.constructionMethod.internalWallThickness,
      constructionSystem: project.constructionMethod.methodId,
    });
  };

  const handleAuthorizeProposal = () => {
    if (!result?.proposedTypology) return;
    const ut = buildUnitFromProposal(result.proposedTypology);
    onAuthorizeTypology(ut);
    setAppliedBanner(`Tipologia "${ut.code} — ${ut.name}" criada após sua autorização.`);
  };

  const handleOfflineCreate = () => {
    const ut = buildUnitFromProposal({
      name: `Kitnet Paramétrica ${round2(offlineW * offlineD)} m²`,
      targetArea: round2(offlineW * offlineD),
      width: offlineW,
      depth: offlineD,
      ceilingHeight: offlineMezzanine ? 4.4 : 2.7,
      bedrooms: 0,
      bathrooms: 1,
      hasLaundry: offlineLaundry,
      hasBalcony: offlineBalcony,
      hasMezzanine: offlineMezzanine,
      accessible: false,
    });
    onAuthorizeTypology(ut);
    setAppliedBanner(`Tipologia "${ut.code}" gerada localmente pelo motor paramétrico.`);
  };

  // Paginate long answer blocks (~420 chars per page) so zero scroll is ever needed
  const answerChunks = (() => {
    if (!result?.answer) return [] as string[];
    const text = result.answer.trim();
    if (text.length <= 420) return [text];
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += 420) {
      chunks.push(text.slice(i, i + 420));
    }
    return chunks;
  })();
  const safeAnswerPage = Math.min(answerPage, Math.max(0, answerChunks.length - 1));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="flex h-dvh w-full max-w-lg flex-col overflow-hidden border-l border-slate-800 bg-[#1B1E24] text-slate-100 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 shrink-0 text-[#2F7CF6]" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-white">
                Assistente Técnico de Arquitetura
              </h2>
              <p className="truncate text-[11px] text-slate-400">
                Prévia controlada por autorização · Sem scroll
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white shrink-0"
            aria-label="Fechar assistente"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sub-Tabs inside Drawer */}
        <div className="flex shrink-0 gap-1 border-b border-slate-800 bg-[#14161A] px-4 py-1.5">
          <button
            type="button"
            onClick={() => setDrawerTab('ia')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium whitespace-nowrap ${
              drawerTab === 'ia' ? 'bg-[#2F7CF6] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Assistente IA
          </button>
          <button
            type="button"
            onClick={() => setDrawerTab('local')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium whitespace-nowrap ${
              drawerTab === 'local' ? 'bg-[#2F7CF6] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            Gerador Paramétrico Local
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-between gap-3 overflow-hidden p-4">
          {drawerTab === 'ia' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <div className="shrink-0 space-y-1.5">
                <span className="text-[11px] font-medium text-slate-400">Sugestões rápidas</span>
                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    'Gerar kitnet de 25 m², cozinha integrada, área de serviço e varanda',
                    'Avaliar riscos de compatibilização e pendências normativas atuais',
                    'Sugerir adaptações NBR 9050 para unidade acessível no térreo',
                  ].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setPrompt(s);
                        askAssistant(s);
                      }}
                      className="truncate rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-left text-[11px] text-slate-300 hover:border-[#2F7CF6] hover:text-white transition-colors"
                      title={s}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  askAssistant(prompt);
                }}
                className="shrink-0 space-y-2"
              >
                <textarea
                  rows={2}
                  maxLength={2000}
                  placeholder="Descreva a tipologia desejada ou solicite orientação técnica..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-[#14161A] p-2.5 text-xs text-white focus:border-[#2F7CF6] focus:outline-none resize-none"
                />
                <button
                  type="submit"
                  disabled={loading || !prompt.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded bg-[#2F7CF6] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#2567d4] disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {loading ? 'Consultando Assistente...' : 'Analisar Solicitação'}
                </button>
              </form>

              {errorMsg && (
                <div className="flex shrink-0 items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <div>{errorMsg}</div>
                </div>
              )}

              {appliedBanner && (
                <div className="flex shrink-0 items-start gap-2 rounded border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <div>{appliedBanner}</div>
                </div>
              )}

              {result && (
                <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 overflow-hidden rounded-lg border border-slate-700 bg-[#14161A] p-3">
                  <div className="min-h-0 flex-1 overflow-hidden text-xs leading-relaxed text-slate-200">
                    {answerChunks[safeAnswerPage]}
                  </div>

                  {answerChunks.length > 1 && (
                    <div className="flex shrink-0 items-center justify-between border-t border-slate-800 pt-1.5 text-[11px] font-mono text-slate-400">
                      <button
                        type="button"
                        onClick={() => setAnswerPage((p) => Math.max(0, p - 1))}
                        disabled={safeAnswerPage <= 0}
                        className="rounded border border-slate-700 px-2 py-0.5 disabled:opacity-35"
                      >
                        Anterior
                      </button>
                      <span>
                        Parte {safeAnswerPage + 1}/{answerChunks.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAnswerPage((p) => Math.min(answerChunks.length - 1, p + 1))}
                        disabled={safeAnswerPage >= answerChunks.length - 1}
                        className="rounded border border-slate-700 px-2 py-0.5 disabled:opacity-35"
                      >
                        Próxima
                      </button>
                    </div>
                  )}

                  {result.warnings && result.warnings.length > 0 && (
                    <div className="shrink-0 truncate border-t border-slate-800 pt-1.5 text-[11px] text-amber-300" title={result.warnings.join(' | ')}>
                      ⚠ {result.warnings[0]}
                    </div>
                  )}

                  {result.applyTypologyProposal && result.proposedTypology && (
                    <div className="shrink-0 space-y-2 rounded border border-[#2F7CF6]/50 bg-[#2F7CF6]/10 p-2.5 text-xs">
                      <div className="font-semibold text-white">
                        Prévia Proposta ({round2(result.proposedTypology.width * result.proposedTypology.depth)} m²)
                      </div>
                      <div className="grid grid-cols-2 gap-1 font-mono text-[11px] text-slate-300 tabular-nums">
                        <span className="truncate">{result.proposedTypology.name}</span>
                        <span>
                          {result.proposedTypology.width}×{result.proposedTypology.depth} m
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleAuthorizeProposal}
                          className="flex-1 rounded bg-[#2F7CF6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2567d4]"
                        >
                          Autorizar e Criar
                        </button>
                        <button
                          type="button"
                          onClick={() => setResult((r) => (r ? { ...r, applyTypologyProposal: false } : r))}
                          className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          Descartar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-slate-800 bg-[#14161A] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Wrench className="h-3.5 w-3.5 text-[#2F7CF6]" />
                Gerador Paramétrico Determinístico (Offline)
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-[11px] text-slate-400">Largura (m)</span>
                  <input
                    type="number"
                    step="0.25"
                    min="3"
                    max="10"
                    value={offlineW}
                    onChange={(e) => setOfflineW(Number(e.target.value) || 4)}
                    className="w-full rounded border border-slate-700 bg-[#1B1E24] px-2.5 py-1.5 font-mono tabular-nums text-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-slate-400">Profundidade (m)</span>
                  <input
                    type="number"
                    step="0.25"
                    min="4"
                    max="15"
                    value={offlineD}
                    onChange={(e) => setOfflineD(Number(e.target.value) || 6.25)}
                    className="w-full rounded border border-slate-700 bg-[#1B1E24] px-2.5 py-1.5 font-mono tabular-nums text-white"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-slate-300">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={offlineLaundry}
                    onChange={(e) => setOfflineLaundry(e.target.checked)}
                  />
                  Área de serviço
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={offlineBalcony}
                    onChange={(e) => setOfflineBalcony(e.target.checked)}
                  />
                  Varanda
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={offlineMezzanine}
                    onChange={(e) => setOfflineMezzanine(e.target.checked)}
                  />
                  Mezanino
                </label>
              </div>
              {appliedBanner && (
                <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">
                  {appliedBanner}
                </div>
              )}
              <button
                type="button"
                onClick={handleOfflineCreate}
                className="w-full rounded bg-[#2F7CF6] px-3 py-2 text-xs font-medium text-white hover:bg-[#2567d4]"
              >
                Criar Tipologia Local ({round2(offlineW * offlineD)} m²)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
