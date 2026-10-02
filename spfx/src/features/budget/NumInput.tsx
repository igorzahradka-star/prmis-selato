/**
 * Číselné políčko do husté tabulky rozpočtu. Píše se česky (1 250,5); hodnota se přijme při opuštění políčka nebo Enterem.
 * Prázdné políčko = „bez hodnoty“ (u přirážky to znamená, že platí výchozí ze skupiny).
 */

import * as React from 'react';

import { parseAmount } from '../../core/format';
import { RES } from '../../ui/theme';

const show = (v: number | undefined, decimals: number): string =>
  v === undefined ? '' : v.toLocaleString('cs-CZ', { maximumFractionDigits: decimals, useGrouping: false }).replace('.', ',');

export const CELL_INPUT: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 28,
  padding: '0 6px',
  border: `1px solid ${RES.grayBlue}`,
  borderRadius: 2,
  background: RES.white,
  fontSize: 13,
  fontFamily: 'inherit',
  color: RES.text
};

export const NumInput: React.FC<{
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  ariaLabel: string;
  decimals?: number;
  placeholder?: string;
  disabled?: boolean;
  /** Hodnota se jen zdědila (např. přirážka ze skupiny) — zobrazí se šedě a kurzívou. */
  inherited?: boolean;
  /** Prázdné políčko je dovolené (jinak se vrátí původní hodnota). */
  allowEmpty?: boolean;
  align?: 'left' | 'right';
}> = ({ value, onCommit, ariaLabel, decimals = 2, placeholder, disabled, inherited, allowEmpty, align = 'right' }) => {
  const [text, setText] = React.useState(show(value, decimals));
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (!focused) {
      setText(show(value, decimals));
    }
  }, [value, decimals, focused]);

  const commit = (): void => {
    setFocused(false);
    const t = text.trim();
    if (t === '') {
      if (allowEmpty) {
        onCommit(undefined);
      } else {
        setText(show(value, decimals));
      }
      return;
    }
    const n = parseAmount(t);
    if (n === undefined) {
      setText(show(value, decimals));
      return;
    }
    onCommit(n);
  };

  return (
    <input
      aria-label={ariaLabel}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      inputMode="decimal"
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      style={{
        ...CELL_INPUT,
        textAlign: align,
        color: inherited ? RES.gray : RES.text,
        fontStyle: inherited ? 'italic' : 'normal',
        background: disabled ? RES.background : RES.white
      }}
    />
  );
};
