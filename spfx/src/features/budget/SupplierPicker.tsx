/**
 * Výběr dodavatele do tabulky rozpočtu: píše se, seznam partnerů se zužuje podle písmen kdekoli v názvu (bez ohledu na
 * velikost písmen a diakritiku); když dodavatel v seznamu není, nabídne se jeho založení. Nabídka je v samostatné vrstvě
 * (Callout), aby ji neuřízl vodorovně rolovaný obal tabulky.
 */

import * as React from 'react';
import { Callout, DirectionalHint } from '@fluentui/react/lib/Callout';

import { RES } from '../../ui/theme';
import { Partner } from '../../core/types';
import { CELL_INPUT } from './NumInput';

const norm = (s: string): string =>
  s
    .toLocaleLowerCase('cs-CZ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/** Partneři, jejichž název nebo IČO obsahuje zadaný text; dodavatelé a „obojí“ jako první. */
export function matchPartners(partners: Partner[], text: string, limit: number = 8): Partner[] {
  const q = norm(text);
  const hit = q === '' ? partners : partners.filter((p) => norm(p.name).indexOf(q) !== -1 || (p.ico ?? '').indexOf(q) !== -1);
  return hit
    .filter((p) => p.isActive)
    .sort((a, b) => Number(b.partnerType !== 'Zákazník') - Number(a.partnerType !== 'Zákazník') || a.name.localeCompare(b.name, 'cs-CZ'))
    .slice(0, limit);
}

export const SupplierPicker: React.FC<{
  value: string | undefined;
  partners: Partner[];
  disabled?: boolean;
  onChange: (name: string | undefined) => void;
  /** Založit nového partnera; text, který uživatel napsal, se předvyplní jako název. */
  onCreate: (suggestedName: string) => void;
}> = ({ value, partners, disabled, onChange, onCreate }) => {
  const ref = React.useRef<HTMLInputElement>(null);
  const [text, setText] = React.useState(value ?? '');
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setText(value ?? '');
    }
  }, [value, open]);

  const matches = matchPartners(partners, text);
  const exact = partners.some((p) => norm(p.name) === norm(text));

  const pick = (name: string | undefined): void => {
    onChange(name);
    setText(name ?? '');
    setOpen(false);
  };

  return (
    <>
      <input
        ref={ref}
        aria-label="Dodavatel"
        value={text}
        disabled={disabled}
        placeholder="Dodavatel"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          // Klik do nabídky nesmí zavřít seznam dřív, než se vybere (viz onMouseDown níže); volný text se ponechá.
          window.setTimeout(() => {
            setOpen(false);
            const t = text.trim();
            if (t !== (value ?? '')) {
              onChange(t === '' ? undefined : t);
            }
          }, 150);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (matches.length > 0 && !exact) {
              pick(matches[0].name);
            } else {
              (e.currentTarget as HTMLInputElement).blur();
            }
          }
        }}
        style={{ ...CELL_INPUT, background: disabled ? RES.background : RES.white }}
      />
      {open && !disabled && ref.current && (
        <Callout target={ref.current} isBeakVisible={false} directionalHint={DirectionalHint.bottomLeftEdge} setInitialFocus={false} onDismiss={() => setOpen(false)} styles={{ root: { minWidth: 260, maxWidth: 420 } }}>
          <div role="listbox" aria-label="Partneři" style={{ maxHeight: 280, overflowY: 'auto', padding: 4 }}>
            {matches.map((p) => (
              <div
                key={p.id}
                role="option"
                aria-selected={p.name === value}
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p.name);
                }}
                style={{ padding: '6px 8px', cursor: 'pointer', borderRadius: 2, fontSize: 13 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = RES.bluePale)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div>{p.name}</div>
                <div style={{ fontSize: 11, color: RES.gray }}>
                  {[p.partnerType, p.ico ? `IČO ${p.ico}` : ''].filter((x) => !!x).join(' · ')}
                </div>
              </div>
            ))}
            {matches.length === 0 && <div style={{ padding: '6px 8px', fontSize: 12, color: RES.gray }}>V seznamu partnerů nikdo takový není.</div>}
            {!exact && (
              <div
                role="option"
                aria-selected={false}
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  onCreate(text.trim());
                }}
                style={{ padding: '6px 8px', cursor: 'pointer', borderTop: `1px solid ${RES.grayBlue}`, color: RES.blue, fontSize: 13, fontWeight: 600 }}
              >
                + Založit nového partnera{text.trim() !== '' ? ` „${text.trim()}“` : ''}
              </div>
            )}
            {value && (
              <div
                role="option"
                aria-selected={false}
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(undefined);
                }}
                style={{ padding: '6px 8px', cursor: 'pointer', color: RES.gray, fontSize: 12 }}
              >
                Vymazat dodavatele
              </div>
            )}
          </div>
        </Callout>
      )}
    </>
  );
};
