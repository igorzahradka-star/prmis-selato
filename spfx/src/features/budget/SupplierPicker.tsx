/**
 * Výběr dodavatele ze seznamu partnerů — volné psaní se nepřijímá. Po kliknutí do pole se otevře celý rolovací seznam
 * partnerů; psaním se zužuje podle písmen kdekoli v názvu nebo IČO (bez ohledu na velikost písmen a diakritiku).
 * Na konci seznamu je vždy „+ Založit nového partnera“. Co není v seznamu, se po opuštění pole vrátí na původní hodnotu.
 * Nabídka je v samostatné vrstvě (Callout), aby ji neuřízl vodorovně rolovaný obal tabulky.
 *
 * Dodavatel zapsaný dřív jako volný text (např. z importu) se zobrazí, ale oranžově obtažený — nejde o partnera ze
 * seznamu, tak ať ho uživatel vybere nebo založí.
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
  /** Vzhled pole (výchozí: buňka tabulky). */
  inputStyle?: React.CSSProperties;
}> = ({ value, partners, disabled, onChange, onCreate, inputStyle }) => {
  const ref = React.useRef<HTMLInputElement>(null);
  const [text, setText] = React.useState(value ?? '');
  const [typed, setTyped] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const latest = React.useRef({ text, value, partners });
  latest.current = { text, value, partners };

  React.useEffect(() => {
    if (!open) {
      setText(value ?? '');
    }
  }, [value, open]);

  // Dokud uživatel nezačne psát, ukáže se celý seznam (ne jen právě vybraný partner).
  const matches = matchPartners(partners, typed ? text : '', 500);
  const exactPartner = (t: string): Partner | undefined => partners.filter((p) => norm(p.name) === norm(t))[0];
  const unknown = !!value && partners.length > 0 && !exactPartner(value);

  const pick = (name: string | undefined): void => {
    onChange(name);
    setText(name ?? '');
    setTyped(false);
    setOpen(false);
  };

  return (
    <>
      <div style={{ position: 'relative' }}>
        <input
          ref={ref}
          aria-label="Dodavatel"
          value={text}
          disabled={disabled}
          placeholder="Vyberte dodavatele"
          autoComplete="off"
          title={unknown ? 'Tento dodavatel není v seznamu partnerů — vyberte ho ze seznamu, nebo založte nového.' : undefined}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setTyped(true);
            setOpen(true);
          }}
          onBlur={() => {
            // Klik do nabídky nesmí zavřít seznam dřív, než se vybere (viz onMouseDown níže).
            window.setTimeout(() => {
              setOpen(false);
              setTyped(false);
              const cur = latest.current;
              const t = cur.text.trim();
              if (t === '') {
                if (cur.value) {
                  onChange(undefined);
                }
                return;
              }
              const found = cur.partners.filter((p) => norm(p.name) === norm(t))[0];
              if (found) {
                if (found.name !== cur.value) {
                  onChange(found.name);
                }
                setText(found.name);
              } else {
                // Co není v seznamu partnerů, se nepřijme — vrátí se původní hodnota.
                setText(cur.value ?? '');
              }
            }, 150);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (typed && matches.length > 0) {
                pick(matches[0].name);
              } else {
                (e.currentTarget as HTMLInputElement).blur();
              }
            }
          }}
          style={{
            ...CELL_INPUT,
            paddingRight: 20,
            background: disabled ? RES.background : RES.white,
            ...(unknown ? { border: `1px solid ${RES.amber}` } : {}),
            ...inputStyle
          }}
        />
        {!disabled && (
          <span aria-hidden="true" style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: RES.gray, pointerEvents: 'none' }}>
            ▼
          </span>
        )}
      </div>
      {open && !disabled && ref.current && (
        <Callout target={ref.current} isBeakVisible={false} directionalHint={DirectionalHint.bottomLeftEdge} setInitialFocus={false} onDismiss={() => setOpen(false)} styles={{ root: { minWidth: 280, maxWidth: 440 } }}>
          <div role="listbox" aria-label="Partneři" style={{ maxHeight: 260, overflowY: 'auto', padding: 4 }}>
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
                style={{ padding: '6px 8px', cursor: 'pointer', borderRadius: 2, fontSize: 13, background: p.name === value ? RES.bluePale : 'transparent' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = RES.bluePale)}
                onMouseLeave={(e) => (e.currentTarget.style.background = p.name === value ? RES.bluePale : 'transparent')}
              >
                <div>{p.name}</div>
                <div style={{ fontSize: 11, color: RES.gray }}>{[p.partnerType, p.ico ? `IČO ${p.ico}` : ''].filter((x) => !!x).join(' · ')}</div>
              </div>
            ))}
            {matches.length === 0 && <div style={{ padding: '6px 8px', fontSize: 12, color: RES.gray }}>V seznamu partnerů nikdo takový není.</div>}
          </div>
          {/* Pevně na konci seznamu, aby byla volba „nový partner“ vždy po ruce. */}
          <div style={{ padding: 4, borderTop: `1px solid ${RES.grayBlue}` }}>
            <div
              role="option"
              aria-selected={false}
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                onCreate(typed && !exactPartner(text) ? text.trim() : '');
              }}
              style={{ padding: '6px 8px', cursor: 'pointer', color: RES.blue, fontSize: 13, fontWeight: 600 }}
            >
              + Založit nového partnera{typed && text.trim() !== '' && !exactPartner(text) ? ` „${text.trim()}“` : ''}
            </div>
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
