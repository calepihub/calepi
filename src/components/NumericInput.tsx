import React, { useEffect, useState } from 'react';

interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onCommit: (nextValue: number) => void;
  min?: number;
  max?: number;
  decimals?: number;
  integerOnly?: boolean;
}

/**
 * Controlled numeric input that maintains a local draft string while focused,
 * accepts both '.' and ',' decimal separators, and commits cleanly without
 * snapping mid-keystroke or forcing empty inputs to 0.
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onCommit,
  min,
  max,
  decimals = 2,
  integerOnly = false,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}) => {
  const formatVal = (n: number): string => {
    if (!Number.isFinite(n)) return '';
    if (integerOnly) return String(Math.round(n));
    const factor = 10 ** decimals;
    const rounded = Math.round(n * factor) / factor;
    return String(rounded);
  };

  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string>(() => formatVal(value));

  useEffect(() => {
    if (!focused) {
      setDraft(formatVal(value));
    }
  }, [value, focused]);

  const clampValue = (n: number): number => {
    let next = integerOnly ? Math.round(n) : n;
    if (typeof min === 'number') next = Math.max(min, next);
    if (typeof max === 'number') next = Math.min(max, next);
    return next;
  };

  const commitDraft = (raw: string) => {
    const normalized = raw.trim().replace(',', '.');
    if (normalized === '' || normalized === '-' || normalized === '.') {
      setDraft(formatVal(value));
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      setDraft(formatVal(value));
      return;
    }
    const clamped = clampValue(parsed);
    onCommit(clamped);
    setDraft(formatVal(clamped));
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={integerOnly ? 'numeric' : 'decimal'}
      value={draft}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        // Allow partial typing such as '', '3.', '3,', '-1'
        if (!/^-?\d*[.,]?\d*$/.test(raw)) return;
        setDraft(raw);

        const normalized = raw.trim().replace(',', '.');
        if (
          normalized === '' ||
          normalized === '-' ||
          normalized.endsWith('.') ||
          (integerOnly && normalized.includes('.'))
        ) {
          return;
        }
        const parsed = Number(normalized);
        if (!Number.isFinite(parsed)) return;
        if (typeof min === 'number' && parsed < min) return;
        if (typeof max === 'number' && parsed > max) return;
        onCommit(integerOnly ? Math.round(parsed) : parsed);
      }}
      onBlur={(e) => {
        setFocused(false);
        commitDraft(draft);
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commitDraft(draft);
        }
        onKeyDown?.(e);
      }}
    />
  );
};
