/**
 * Tabulka zápisů ze stavby — společná pro seznam všech zápisů a záložku projektu.
 */

import * as React from 'react';
import { DetailsList, DetailsListLayoutMode, IColumn, SelectionMode } from '@fluentui/react/lib/DetailsList';
import { Link } from '@fluentui/react/lib/Link';

import { buildHash, RouteName } from '../../ui/router';
import { formatDate } from '../../core/format';
import { DiaryEntry, isHandover, protocolNumber } from '../../core/siteDiary';
import { EntryStatusBadge } from './EntryStatusBadge';

export interface EntriesTableProps {
  entries: DiaryEntry[];
  onOpen: (id: number) => void;
  /** U seznamu jednoho projektu je sloupec Projekt zbytečný. */
  hideProject?: boolean;
  /** Seznam předávacích protokolů: bez sloupce Deník, s číslem PP a sloupcem Přebírá. */
  protocols?: boolean;
  ariaLabel?: string;
}

export const EntriesTable: React.FC<EntriesTableProps> = ({ entries, onOpen, hideProject, protocols, ariaLabel }) => {
  const columns: IColumn[] = [
    {
      key: 'no',
      name: protocols ? 'Protokol' : 'Zápis',
      minWidth: protocols ? 100 : 60,
      maxWidth: protocols ? 130 : 80,
      isResizable: true,
      onRender: (e: DiaryEntry) => (
        <Link onClick={() => onOpen(e.id)} style={{ fontWeight: 600 }}>
          {isHandover(e) ? protocolNumber(e.projectNumber, e.entryNo) : `č. ${e.entryNo}`}
        </Link>
      )
    },
    { key: 'date', name: 'Datum', minWidth: 80, maxWidth: 100, isResizable: true, onRender: (e: DiaryEntry) => formatDate(e.date) },
    ...(hideProject
      ? []
      : [
          {
            key: 'project',
            name: 'Projekt',
            minWidth: 70,
            maxWidth: 90,
            isResizable: true,
            onRender: (e: DiaryEntry) => <Link href={buildHash(RouteName.ProjectDetail, e.projectNumber)}>{e.projectNumber}</Link>
          } as IColumn
        ]),
    ...(protocols
      ? []
      : [{ key: 'diary', name: 'Deník', minWidth: 110, maxWidth: 170, isResizable: true, onRender: (e: DiaryEntry) => e.diaryTitle || '—' } as IColumn]),
    {
      key: 'construction',
      name: 'Stavba',
      minWidth: 160,
      isResizable: true,
      onRender: (e: DiaryEntry) => <span title={e.header.constructionName}>{e.header.constructionName || '—'}</span>
    },
    { key: 'with', name: protocols ? 'Přebírá' : 'Jednání s', minWidth: 120, maxWidth: 180, isResizable: true, onRender: (e: DiaryEntry) => e.header.counterparty || '—' },
    {
      key: 'status',
      name: 'Stav',
      minWidth: 130,
      maxWidth: 220,
      isResizable: true,
      onRender: (e: DiaryEntry) => <EntryStatusBadge status={e.status} signatureKind={e.signatureKind} />
    },
    { key: 'by', name: protocols ? 'Vystavil' : 'Zapsal', minWidth: 110, maxWidth: 150, isResizable: true, onRender: (e: DiaryEntry) => e.createdByName || '—' }
  ];

  return (
    <DetailsList
      items={entries}
      columns={columns}
      selectionMode={SelectionMode.none}
      layoutMode={DetailsListLayoutMode.justified}
      compact
      isHeaderVisible
      ariaLabelForGrid={ariaLabel || 'Seznam zápisů ze stavby'}
    />
  );
};
