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
import type { Project, UnitType } from '../types/project';

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
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AssistantResponse | null>(null);
  const [appliedBanner, setAppliedBanner] = useState<string | null>(null);

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
        'Não foi possível conectar ao serviço de IA. Utilize o gerador paramétrico determinístico abaixo.',
      );
    } finally {
      setLoading(false);
    }
  };

  const buildUnitFromProposal = (prop: AssistantProposal): UnitType => {
    const code = `TIPO-${String.fromCharCode(65 + project.unitTypes.length)}`;
    const hasMezzanine = Boolean(prop.hasMezzanine);
    const validEntry =
      prop.entrySide === 'frente' ||
      prop.entrySide === 'fundo' ||
      prop.entrySide === 'esquerda' ||
      prop.entrySide === 'direita'
        ? prop.entrySide
        : 'frente';
    const validPartition =
      prop.internalPartitionType === 'aberta_studio' ||
      prop.internalPartitionType === 'divisoria_parcial' ||
      prop.internalPartitionType === 'quarto_fechado'
        ? prop.internalPartitionType
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
    setAppliedBanner(`Tipologia "${ut.code} — ${ut.name}" criada e adicionada após sua autorização.`);
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/45 dark:bg-black/60">
      <div className="flex h-full w-full max-w-lg flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1B1E24] text-slate-900 dark:text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#1D5B6E] dark:text-[#2F7CF6]" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Assistente Técnico de Arquitetura
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Prévia controlada por autorização · Não substitui cálculo normativo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
            aria-label="Fechar assistente"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="space-y-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Sugestões rápidas
            </span>
            <div className="flex flex-wrap gap-1.5">
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
                  className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#14161A] px-2.5 py-1.5 text-left text-[11px] text-slate-700 dark:text-slate-300 hover:border-[#1D5B6E] dark:hover:border-[#2F7CF6] hover:text-slate-900 dark:hover:text-white transition-colors"
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
            className="space-y-2"
          >
            <textarea
              rows={3}
              maxLength={2000}
              placeholder="Descreva a tipologia desejada ou solicite orientação técnica sobre o empreendimento..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#14161A] p-3 text-sm text-slate-900 dark:text-white focus:border-[#1D5B6E] dark:focus:border-[#2F7CF6] focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="flex w-full items-center justify-center gap-2 rounded bg-[#1D5B6E] dark:bg-[#2F7CF6] px-4 py-2 text-sm font-medium text-white hover:bg-[#164857] dark:hover:bg-[#2567d4] disabled:opacity-50 transition-colors"
            >
              <Send className="h-4 w-4" />
              {loading ? 'Consultando Assistente...' : 'Analisar Solicitação'}
            </button>
          </form>

          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>{errorMsg}</div>
            </div>
          )}

          {appliedBanner && (
            <div className="flex items-start gap-2.5 rounded-lg border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>{appliedBanner}</div>
            </div>
          )}

          {result && (
            <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#14161A] p-4">
              <div className="text-xs leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                {result.answer}
              </div>

              {result.warnings && result.warnings.length > 0 && (
                <ul className="space-y-1 border-t border-slate-200 dark:border-slate-800 pt-2 text-[11px] text-amber-700 dark:text-amber-300">
                  {result.warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              )}

              {result.applyTypologyProposal && result.proposedTypology && (
                <div className="space-y-2.5 rounded border border-[#1D5B6E]/30 dark:border-[#2F7CF6]/50 bg-[#1D5B6E]/5 dark:bg-[#2F7CF6]/10 p-3 text-xs">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    Prévia de Tipologia Proposta (Requer Autorização)
                  </div>
                  <div className="grid grid-cols-2 gap-1 font-mono text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                    <span>Nome: {result.proposedTypology.name}</span>
                    <span>
                      Dimensões: {result.proposedTypology.width}×{result.proposedTypology.depth} m
                    </span>
                    <span>
                      Área: {round2(result.proposedTypology.width * result.proposedTypology.depth)} m²
                    </span>
                    <span>Dormitórios: {result.proposedTypology.bedrooms}</span>
                    <span>
                      Lavanderia: {result.proposedTypology.hasLaundry ? 'Sim' : 'Não'}
                    </span>
                    <span>Varanda: {result.proposedTypology.hasBalcony ? 'Sim' : 'Não'}</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleAuthorizeProposal}
                      className="flex-1 rounded bg-[#1D5B6E] dark:bg-[#2F7CF6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#164857] dark:hover:bg-[#2567d4]"
                    >
                      Autorizar e Criar Tipologia
                    </button>
                    <button
                      type="button"
                      onClick={() => setResult((r) => (r ? { ...r, applyTypologyProposal: false } : r))}
                      className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Deterministic Offline Parametric Fallback */}
          <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#14161A] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <Wrench className="h-3.5 w-3.5 text-[#1D5B6E] dark:text-[#2F7CF6]" />
              Gerador Paramétrico Local (Sem dependência de IA)
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="space-y-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Largura (m)</span>
                <input
                  type="number"
                  step="0.25"
                  min="3"
                  max="10"
                  value={offlineW}
                  onChange={(e) => setOfflineW(Number(e.target.value) || 4)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1B1E24] px-2.5 py-1 font-mono tabular-nums text-slate-900 dark:text-white"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Profundidade (m)</span>
                <input
                  type="number"
                  step="0.25"
                  min="4"
                  max="15"
                  value={offlineD}
                  onChange={(e) => setOfflineD(Number(e.target.value) || 6.25)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1B1E24] px-2.5 py-1 font-mono tabular-nums text-slate-900 dark:text-white"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-700 dark:text-slate-300">
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
            <button
              type="button"
              onClick={handleOfflineCreate}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1B1E24] px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-white hover:border-[#1D5B6E] dark:hover:border-[#2F7CF6]"
            >
              Criar Tipologia Local ({round2(offlineW * offlineD)} m²)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
