/**
 * Tabulka objednávek — společná pro seznam všech objednávek, záložku projektu a stránku „Čeká na mě".
 */

import * as React from 'react';
import { DetailsList, DetailsListLayoutMode, IColumn, SelectionMode } from '@fluentui/react/lib/DetailsList';
import { Link } from '@fluentui/react/lib/Link';

import { buildHash, RouteName } from '../../ui/router';
import { formatDate, formatMoney } from '../../core/format';
import { APPROVAL_LEVEL_LABELS, OrderStatus, PurchaseOrder } from '../../core/orders';
import { OrderStatusBadge } from './OrderStatusBadge';

export interface OrdersTableProps {
  orders: PurchaseOrder[];
  onOpen: (id: number) => void;
  /** U seznamu jednoho projektu je sloupec Projekt zbytečný. */
  hideProject?: boolean;
  ariaLabel?: string;
}

export const OrdersTable: React.FC<OrdersTableProps> = ({ orders, onOpen, hideProject, ariaLabel }) => {
  const columns: IColumn[] = [
    {
      key: 'number',
      name: 'Číslo',
      fieldName: 'orderNumber',
      minWidth: 110,
      maxWidth: 130,
      isResizable: true,
      onRender: (o: PurchaseOrder) => (
        <Link onClick={() => onOpen(o.id)} style={{ fontWeight: 600 }}>
          {o.orderNumber}
        </Link>
      )
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
            onRender: (o: PurchaseOrder) => (
              <Link href={buildHash(RouteName.ProjectDetail, o.projectNumber)}>{o.projectNumber}</Link>
            )
          } as IColumn
        ]),
    { key: 'supplier', name: 'Dodavatel', minWidth: 140, maxWidth: 200, isResizable: true, onRender: (o: PurchaseOrder) => o.supplierName || '—' },
    { key: 'subject', name: 'Předmět', minWidth: 180, isResizable: true, onRender: (o: PurchaseOrder) => <span title={o.subject}>{o.subject}</span> },
    {
      key: 'amount',
      name: 'Bez DPH',
      minWidth: 100,
      maxWidth: 130,
      isResizable: true,
      styles: { cellTitle: { justifyContent: 'flex-end' } },
      onRender: (o: PurchaseOrder) => <div style={{ textAlign: 'right' }}>{formatMoney(o.amountNet, o.currency)}</div>
    },
    { key: 'status', name: 'Stav', minWidth: 120, maxWidth: 150, isResizable: true, onRender: (o: PurchaseOrder) => <OrderStatusBadge status={o.status} /> },
    {
      key: 'waiting',
      name: 'Čeká na',
      minWidth: 110,
      maxWidth: 140,
      isResizable: true,
      onRender: (o: PurchaseOrder) =>
        o.status === OrderStatus.KeSchvaleni && o.currentApprovalLevel ? APPROVAL_LEVEL_LABELS[o.currentApprovalLevel] : '—'
    },
    { key: 'by', name: 'Vystavil', minWidth: 110, maxWidth: 150, isResizable: true, onRender: (o: PurchaseOrder) => o.requestedByName || '—' },
    { key: 'delivery', name: 'Dodání', minWidth: 80, maxWidth: 100, isResizable: true, onRender: (o: PurchaseOrder) => formatDate(o.deliveryDate) }
  ];

  return (
    <DetailsList
      items={orders}
      columns={columns}
      selectionMode={SelectionMode.none}
      layoutMode={DetailsListLayoutMode.justified}
      compact
      isHeaderVisible
      ariaLabelForGrid={ariaLabel || 'Seznam objednávek'}
    />
  );
};
