/**
 * Výběr zákazníka z partnerů, nebo zápis nového.
 *
 * Fluent ComboBox s volným psaním (`allowFreeform`) po kliknutí do pole seznam
 * neotevře — otevírá ho jen malá šipka vpravo. Lidé kliknou do pole, nic se
 * nestane a mají dojem, že se vybrat nedá. Proto se seznam otevírá i při kliknutí
 * do textu.
 */

import * as React from 'react';
import { ComboBox, IComboBox, IComboBoxOption } from '@fluentui/react/lib/ComboBox';

import { Partner } from '../../core/types';

export interface CustomerComboBoxProps {
  partners: Partner[];
  /** Text v poli — název zákazníka. */
  name: string;
  required?: boolean;
  /** Vybrán existující partner ze seznamu. */
  onPick: (partner: { id: number; name: string }) => void;
  /** Napsán vlastní text — nový zákazník, který se založí při uložení. */
  onType: (name: string) => void;
}

export const CustomerComboBox: React.FC<CustomerComboBoxProps> = ({ partners, name, required, onPick, onType }) => {
  const ref = React.useRef<IComboBox>(null);
  const options: IComboBoxOption[] = partners.map((p) => ({ key: p.id, text: p.name }));

  return (
    <div
      onClick={(e) => {
        // Jen klik do textu; šipku si Fluent obsluhuje sám a dvojí přepnutí by seznam hned zavřelo.
        if ((e.target as HTMLElement).tagName === 'INPUT') {
          ref.current?.focus(true);
        }
      }}
    >
      <ComboBox
        componentRef={ref}
        label="Zákazník"
        required={required}
        allowFreeform
        autoComplete="on"
        text={name}
        options={options}
        onChange={(_, option, __, value) => {
          if (option) {
            onPick({ id: option.key as number, name: option.text });
          } else {
            onType(value ?? '');
          }
        }}
        placeholder="Vyberte, nebo zadejte nového zákazníka"
      />
      {partners.length === 0 && (
        <div style={{ fontSize: 12, marginTop: 4, color: '#605e5c' }}>
          V seznamu partnerů zatím nikdo není. Založte zákazníka v části Partneři, nebo sem napište název
          a založí se při uložení.
        </div>
      )}
    </div>
  );
};
