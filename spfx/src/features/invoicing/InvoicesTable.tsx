/**
 * Tabulka podkladů pro fakturaci — společná pro seznam všech podkladů, záložku projektu a „Čeká na mě".
 * Dá se řadit kliknutím na záhlaví; částky jsou vždy v Kč (cizí měna se přepočítá kurzem ČNB).
 */

import * as React from 'react';
import { DetailsList, DetailsListLayoutMode, IColumn, SelectionMode } from '@fluentui/react/lib/DetailsList';
import { Link } from '@fluentui/react/lib/Link';

import { buildHash, RouteName } from '../../ui/router';
import { formatDate, formatMoney } from '../../core/format';
import { amountNetInCzk } from '../../core/orders';
import { RateTable } from '../../core/currency';
import { InvoiceBasis, InvoiceSortKey, isOverdue, sortInvoices } from '../../core/invoiceBases';
import { useOrderRates } from '../orders/useOrderRates';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';

export interface InvoicesTableProps {
  invoices: InvoiceBasis[];
  onOpen: (id: number) => void;
  /** U seznamu jednoho projektu je sloupec Projekt zbytečný. */
  hideProject?: boolean;
  ariaLabel?: string;
}

export const InvoicesTable: React.FC<InvoicesTableProps> = ({ invoices, onOpen, hideProject, ariaLabel }) => {
  const [sort, setSort] = React.useState<{ key: InvoiceSortKey; descending: boolean } | undefined>(undefined);
  const rates: RateTable = useOrderRates();
  const inCzk = (i: InvoiceBasis): number => amountNetInCzk(i.amountNet, i.currency, rates);
  const items = sort ? sortInvoices(invoices, sort.key, sort.descending, inCzk) : invoices;

  const sortable = (key: InvoiceSortKey): Partial<IColumn> => ({
    isSorted: !!sort && sort.key === key,
    isSortedDescending: !!sort && sort.key === key && sort.descending,
    onColumnClick: () => setSort((cur) => (cur && cur.key === key ? { key, descending: !cur.descending } : { key, descending: false }))
  });

  const columns: IColumn[] = [
    {
      key: 'number',
      name: 'Číslo',
      minWidth: 90,
      maxWidth: 110,
      isResizable: true,
      ...sortable('number'),
      onRender: (i: InvoiceBasis) => (
        <Link onClick={() => onOpen(i.id)} style={{ fontWeight: 600 }}>
          {i.number}
        </Link>
      )
    },
    {
      key: 'issued',
      name: 'Vystaveno',
      minWidth: 80,
      maxWidth: 100,
      isResizable: true,
      ...sortable('issued'),
      onRender: (i: InvoiceBasis) => formatDate(i.issueDate)
    },
    ...(hideProject
      ? []
      : [
          {
            key: 'project',
            name: 'Projekt',
            minWidth: 70,
            maxWidth: 90,
            isResizable: true,
            ...sortable('project'),
            onRender: (i: InvoiceBasis) => <Link href={buildHash(RouteName.ProjectDetail, i.projectNumber)}>{i.projectNumber}</Link>
          } as IColumn
        ]),
    {
      key: 'customer',
      name: 'Odběratel',
      minWidth: 160,
      isResizable: true,
      ...sortable('customer'),
      onRender: (i: InvoiceBasis) => <span title={i.customerName}>{i.customerName || '—'}</span>
    },
    {
      key: 'amount',
      name: 'Bez DPH (Kč)',
      minWidth: 100,
      maxWidth: 130,
      isResizable: true,
      ...sortable('amount'),
      styles: { cellTitle: { justifyContent: 'flex-end' } },
      onRender: (i: InvoiceBasis) => (
        <div
          style={{ textAlign: 'right' }}
          title={i.currency === 'CZK' ? undefined : `Původně ${formatMoney(i.amountNet, i.currency)}, přepočteno kurzem ČNB`}
        >
          {i.currency === 'CZK' ? '' : '≈ '}
          {formatMoney(inCzk(i), 'CZK')}
        </div>
      )
    },
    {
      key: 'status',
      name: 'Stav',
      minWidth: 150,
      maxWidth: 210,
      isResizable: true,
      ...sortable('status'),
      onRender: (i: InvoiceBasis) => <InvoiceStatusBadge status={i.status} overdue={isOverdue(i)} />
    },
    {
      key: 'invoiceNo',
      name: 'Faktura č.',
      minWidth: 80,
      maxWidth: 110,
      isResizable: true,
      onRender: (i: InvoiceBasis) => i.accountingInvoiceNo || '—'
    },
    {
      key: 'due',
      name: 'Splatnost',
      minWidth: 80,
      maxWidth: 100,
      isResizable: true,
      ...sortable('due'),
      onRender: (i: InvoiceBasis) => formatDate(i.dueDate)
    },
    {
      key: 'by',
      name: 'Vystavil',
      minWidth: 110,
      maxWidth: 150,
      isResizable: true,
      ...sortable('by'),
      onRender: (i: InvoiceBasis) => i.requestedByName || '—'
    }
  ];

  return (
    <DetailsList
      items={items}
      columns={columns}
      selectionMode={SelectionMode.none}
      layoutMode={DetailsListLayoutMode.justified}
      compact
      isHeaderVisible
      ariaLabelForGrid={ariaLabel || 'Seznam podkladů pro fakturaci'}
    />
  );
};
