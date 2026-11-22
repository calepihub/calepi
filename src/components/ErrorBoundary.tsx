import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import type { FirestoreErrorInfo } from '../firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  firestoreInfo: FirestoreErrorInfo | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '', firestoreInfo: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let parsed: FirestoreErrorInfo | null = null;
    try {
      const candidate = JSON.parse(error.message) as FirestoreErrorInfo;
      if (candidate && candidate.operationType && candidate.error) {
        parsed = candidate;
      }
    } catch {
      parsed = null;
    }
    return {
      hasError: true,
      message: parsed ? parsed.error : error.message || 'Erro inesperado na aplicação.',
      firestoreInfo: parsed,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary capturou erro:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const fi = this.state.firestoreInfo;
    return (
      <div className="flex min-h-screen w-screen items-center justify-center bg-[#14161A] p-6 text-slate-100">
        <div className="w-full max-w-lg rounded-xl border border-red-500/40 bg-[#1B1E24] p-6 shadow-2xl space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-400" />
            <div>
              <h1 className="text-base font-semibold text-white">
                Falha de Conexão ou Permissão no Firebase Firestore
              </h1>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                {this.state.message}
              </p>
            </div>
          </div>

          {fi && (
            <div className="rounded border border-slate-800 bg-[#14161A] p-3 font-mono text-[11px] text-slate-300 space-y-1">
              <div>Operação: {fi.operationType}</div>
              <div>Caminho: {fi.path ?? '—'}</div>
              <div>Usuário: {fi.authInfo.email ?? 'Não autenticado'}</div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-md bg-[#2F7CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2567d4]"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Recarregar Aplicação
            </button>
          </div>
        </div>
      </div>
    );
  }
}
