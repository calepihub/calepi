import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function useViewportPageSize(
  reservedHeightPx: number,
  rowHeightPx: number,
  minItems = 3,
  maxItems = 18,
): number {
  const compute = () => {
    if (typeof window === 'undefined') return Math.max(minItems, Math.min(maxItems, 6));
    const available = Math.max(rowHeightPx * minItems, window.innerHeight - reservedHeightPx);
    return Math.max(minItems, Math.min(maxItems, Math.floor(available / rowHeightPx)));
  };

  const [pageSize, setPageSize] = useState<number>(compute);

  useEffect(() => {
    const onResize = () => setPageSize(compute());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservedHeightPx, rowHeightPx, minItems, maxItems]);

  return pageSize;
}

export function paginateItems<T>(items: readonly T[], page: number, pageSize: number) {
  const safeSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / safeSize));
  const safePage = Math.max(0, Math.min(totalPages - 1, page));
  const start = safePage * safeSize;
  return {
    slice: items.slice(start, start + safeSize),
    safePage,
    totalPages,
    start,
    end: Math.min(items.length, start + safeSize),
  };
}

interface PaginationBarProps {
  page: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (nextPage: number) => void;
  itemLabel?: string;
  compact?: boolean;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  page,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  onPageChange,
  itemLabel = 'itens',
  compact = false,
}) => {
  if (totalItems === 0) {
    return (
      <div className="flex h-7 shrink-0 items-center justify-between border-t border-[#2A2F38] bg-[#171A20] px-3 text-[11px] font-mono text-slate-400">
        <span>0 {itemLabel}</span>
      </div>
    );
  }

  return (
    <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-t border-[#2A2F38] bg-[#171A20] px-3 text-[11px] font-mono tabular-nums text-slate-400">
      <span className="truncate">
        {compact
          ? `${startIndex + 1}–${endIndex} / ${totalItems}`
          : `Exibindo ${startIndex + 1}–${endIndex} de ${totalItems} ${itemLabel}`}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page <= 0}
          className="inline-flex items-center gap-0.5 rounded border border-[#2F3541] bg-[#14161A] px-2 py-0.5 text-[11px] text-slate-200 hover:border-[#2F7CF6] disabled:opacity-35 whitespace-nowrap"
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-3 w-3" />
          {!compact && <span>Anterior</span>}
        </button>
        <span className="px-1 text-slate-300">
          {page + 1}/{totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="inline-flex items-center gap-0.5 rounded border border-[#2F3541] bg-[#14161A] px-2 py-0.5 text-[11px] text-slate-200 hover:border-[#2F7CF6] disabled:opacity-35 whitespace-nowrap"
          aria-label="Próxima página"
        >
          {!compact && <span>Próxima</span>}
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};
