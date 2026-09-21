/**
 * Nápověda přímo v aplikaci.
 *
 * Vysvětluje věci, na které se uživatelé ptají opakovaně — hlavně otevírání
 * složek v Průzkumníku, které prohlížeč z bezpečnostních důvodů neumí.
 */

import * as React from 'react';
import { Link } from '@fluentui/react/lib/Link';
import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { ROLE_LABELS } from '../../core/types';

export const HelpPage: React.FC = () => {
  const { user, settings, dataSource } = useApp();

  return (
    <>
      <PageHeading
        title="Nápověda"
        subtitle="Jak aplikaci používat a na co se lidé nejčastěji ptají"
      />

      <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Article title="Kdo jste a co smíte">
          <p>
            Jste přihlášen{' '}jako <strong>{user.displayName}</strong> ({user.email}).
            Přihlášení se dědí z Microsoftu 365 — žádné další heslo aplikace nepotřebuje.
          </p>
          <p>
            Vaše role:{' '}
            <strong>
              {user.roles.length > 0
                ? user.roles.map((r) => ROLE_LABELS[r]).join(', ')
                : 'zatím žádná'}
            </strong>
            . Role se odvozují z vašeho členství ve skupinách SharePointu. Pokud vám něco
            chybí, požádejte administrátora PRM o přidání do příslušné skupiny.
          </p>
          {dataSource === 'mock' && (
            <p style={{ color: RES.amber }}>
              <strong>Pozor:</strong> stránka teď běží v ukázkovém režimu. Data jsou smyšlená
              a nic se neukládá.
            </p>
          )}
        </Article>

        <Article title="Proč se složka projektu neotevře rovnou v Průzkumníku">
          <p>
            Webový prohlížeč z bezpečnostních důvodů nesmí spouštět programy ve Windows —
            nemůže tedy otevřít Průzkumník. Tlačítko „Otevřít složku projektu“ proto otevře
            složku v SharePointu v novém okně.
          </p>
          <p>
            <strong>Doporučený postup, jak mít složky i v Průzkumníku:</strong>
          </p>
          <ol style={{ margin: '6px 0 0 20px', lineHeight: 1.7 }}>
            <li>Otevřete knihovnu projektů v SharePointu.</li>
            <li>
              Nahoře klikněte na <strong>Synchronizovat</strong> (nebo{' '}
              <strong>Přidat zástupce do Mé soubory</strong>).
            </li>
            <li>Potvrďte otevření aplikace OneDrive.</li>
            <li>
              Od té chvíle máte stejné složky v Průzkumníku pod stejnými názvy — stačí to
              udělat jednou.
            </li>
          </ol>
          <p style={{ marginTop: 8 }}>
            Tlačítkem <strong>Kopírovat název složky</strong> u projektu si navíc zkopírujete
            název do schránky a v Průzkumníku ho jen vložíte do vyhledávání.
          </p>
        </Article>

        <Article title="Kde se berou čísla a názvy projektů">
          <p>
            Číslo přiděluje aplikace sama při založení projektu podle číselné řady nastavené
            administrátorem. Název se vygeneruje podle vzoru{' '}
            <code style={codeStyle}>{settings.projects.titlePattern}</code> a projektový manažer
            ho může před uložením upravit.
          </p>
          <p>
            Doklady se <strong>nemažou</strong>, jen stornují — číselná řada tak zůstává bez
            děr, což je důležité pro audit.
          </p>
        </Article>

        <Article title="Co znamená semafor u rozpočtu">
          <ul style={{ margin: '6px 0 0 20px', lineHeight: 1.7 }}>
            <li>
              <strong>Zelená</strong> — prognóza nákladů nepřekračuje schválený rozpočet.
            </li>
            <li>
              <strong>Žlutá</strong> — překročení do {settings.budget.yellowThresholdPercent} %.
            </li>
            <li>
              <strong>Červená</strong> — překročení nad {settings.budget.yellowThresholdPercent} %,
              nebo marže pod {settings.budget.minimumMarginPercent} %.
            </li>
            <li>
              <strong>Bez rozpočtu</strong> — projekt nemá schválený realizační rozpočet, semafor
              se nepočítá.
            </li>
          </ul>
          <p style={{ marginTop: 8 }}>
            Po najetí myší na semafor se zobrazí konkrétní čísla a odchylka v procentech.
          </p>
        </Article>

        <Article title="Něco nefunguje">
          <p>
            Většina chyb má na svědomí chybějící oprávnění nebo nedokončenou instalaci. Zkuste:
          </p>
          <ol style={{ margin: '6px 0 0 20px', lineHeight: 1.7 }}>
            <li>Načíst stránku znovu (F5).</li>
            <li>
              Pokud jste administrátor, otevřít{' '}
              <Link href="#/instalace">Instalaci a diagnostiku</Link> a zkontrolovat, že je
              datová struktura kompletní.
            </li>
            <li>
              Zkopírovat celou chybovou hlášku i s částí „Technicky:“ a poslat ji
              administrátorovi PRM.
            </li>
          </ol>
        </Article>
      </div>
    </>
  );
};

const codeStyle: React.CSSProperties = {
  background: RES.background,
  border: `1px solid ${RES.grayBlue}`,
  borderRadius: 3,
  padding: '1px 5px',
  fontFamily: 'Consolas, monospace',
  fontSize: 12
};

const Article: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section
    style={{
      background: RES.white,
      border: `1px solid ${RES.grayBlue}`,
      borderRadius: 4,
      padding: '16px 22px'
    }}
  >
    <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: RES.navy }}>{title}</h2>
    <div style={{ fontSize: 13, lineHeight: 1.65, color: RES.text }}>{children}</div>
  </section>
);
