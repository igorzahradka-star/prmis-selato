/**
 * Tabulka objednávek — společná pro seznam všech objednávek, záložku projektu a stránku „Čeká na mě".
 * Dá se řadit kliknutím na záhlaví sloupce (číslo, projekt, dodavatel, předmět, stav, vystavitel, vystaveno, dodání).
 */

import * as React from 'react';
import { DetailsList, DetailsListLayoutMode, IColumn, SelectionMode } from '@fluentui/react/lib/DetailsList';
import { Link } from '@fluentui/react/lib/Link';

import { buildHash, RouteName } from '../../ui/router';
import { formatDate, formatMoney } from '../../core/format';
import { APPROVAL_LEVEL_LABELS, OrderSortKey, OrderStatus, PurchaseOrder, sortOrders } from '../../core/orders';
import { OrderStatusBadge } from './OrderStatusBadge';

export interface OrdersTableProps {
  orders: PurchaseOrder[];
  onOpen: (id: number) => void;
  /** U seznamu jednoho projektu je sloupec Projekt zbytečný. */
  hideProject?: boolean;
  ariaLabel?: string;
}

export const OrdersTable: React.FC<OrdersTableProps> = ({ orders, onOpen, hideProject, ariaLabel }) => {
  // Bez zvoleného sloupce zůstává pořadí, v jakém seznam přišel (nejnovější nahoře).
  const [sort, setSort] = React.useState<{ key: OrderSortKey; descending: boolean } | undefined>(undefined);
  const items = sort ? sortOrders(orders, sort.key, sort.descending) : orders;

  /** Společné vlastnosti sloupce, který jde řadit. */
  const sortable = (key: OrderSortKey): Partial<IColumn> => ({
    isSorted: !!sort && sort.key === key,
    isSortedDescending: !!sort && sort.key === key && sort.descending,
    onColumnClick: () =>
      setSort((cur) => (cur && cur.key === key ? { key, descending: !cur.descending } : { key, descending: false }))
  });

  const columns: IColumn[] = [
    {
      key: 'number',
      name: 'Číslo',
      fieldName: 'orderNumber',
      minWidth: 110,
      maxWidth: 130,
      isResizable: true,
      ...sortable('number'),
      onRender: (o: PurchaseOrder) => (
        <Link onClick={() => onOpen(o.id)} style={{ fontWeight: 600 }}>
          {o.orderNumber}
        </Link>
      )
    },
    {
      key: 'created',
      name: 'Vystaveno',
      minWidth: 80,
      maxWidth: 100,
      isResizable: true,
      ...sortable('created'),
      onRender: (o: PurchaseOrder) => formatDate(o.created)
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
            onRender: (o: PurchaseOrder) => (
              <Link href={buildHash(RouteName.ProjectDetail, o.projectNumber)}>{o.projectNumber}</Link>
            )
          } as IColumn
        ]),
    {
      key: 'supplier',
      name: 'Dodavatel',
      minWidth: 140,
      maxWidth: 200,
      isResizable: true,
      ...sortable('supplier'),
      onRender: (o: PurchaseOrder) => o.supplierName || '—'
    },
    {
      key: 'subject',
      name: 'Předmět',
      minWidth: 180,
      isResizable: true,
      ...sortable('subject'),
      onRender: (o: PurchaseOrder) => <span title={o.subject}>{o.subject}</span>
    },
    {
      // Částky jsou v různých měnách, řazení podle nich by bylo zavádějící — proto bez řazení.
      key: 'amount',
      name: 'Bez DPH',
      minWidth: 100,
      maxWidth: 130,
      isResizable: true,
      styles: { cellTitle: { justifyContent: 'flex-end' } },
      onRender: (o: PurchaseOrder) => <div style={{ textAlign: 'right' }}>{formatMoney(o.amountNet, o.currency)}</div>
    },
    {
      key: 'status',
      name: 'Stav',
      minWidth: 120,
      maxWidth: 150,
      isResizable: true,
      ...sortable('status'),
      onRender: (o: PurchaseOrder) => <OrderStatusBadge status={o.status} />
    },
    {
      key: 'waiting',
      name: 'Čeká na',
      minWidth: 110,
      maxWidth: 140,
      isResizable: true,
      onRender: (o: PurchaseOrder) => {
        if (o.status !== OrderStatus.KeSchvaleni || !o.currentApprovalLevel) {
          return '—';
        }
        const step = o.approvalChain.filter((s) => !s.approved)[0];
        return step && step.assignedName ? step.assignedName : APPROVAL_LEVEL_LABELS[o.currentApprovalLevel];
      }
    },
    {
      key: 'by',
      name: 'Vystavil',
      minWidth: 110,
      maxWidth: 150,
      isResizable: true,
      ...sortable('by'),
      onRender: (o: PurchaseOrder) => o.requestedByName || '—'
    },
    {
      key: 'delivery',
      name: 'Dodání',
      minWidth: 80,
      maxWidth: 100,
      isResizable: true,
      ...sortable('delivery'),
      onRender: (o: PurchaseOrder) => formatDate(o.deliveryDate)
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
      ariaLabelForGrid={ariaLabel || 'Seznam objednávek'}
    />
  );
};
