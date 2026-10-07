/**
 * Vazby harmonogramu na rozpočet, cashflow a objednávky (Fáze 4, krok 4c) — čistá logika.
 *
 * - Platba nákladu se může navázat na úkol: datum faktury = zahájení nebo dokončení úkolu + počet dnů, splatnost = faktura + dny.
 *   Posune-li se úkol v harmonogramu, posunou se i platby v cashflow.
 * - Položka rozpočtu se může navázat na úkol, který ji potřebuje (např. dodávka materiálu před montáží). Objednávky položky
 *   s termínem dodání po zahájení úkolu se hlásí jako konflikt, včetně dopadu na kritickou cestu.
 */

import { BudgetItem, PlannedPayment } from './budget';
import { CZECH_WORKDAYS, dayOf, workdaysBetween } from './workCalendar';
import { OrderStatus } from './orders';

const p2 = (n: number): string => (n < 10 ? `0${n}` : String(n));
const dayText = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** Termíny úkolu, jak je potřebují vazby (z uloženého harmonogramu). */
export interface TaskDates {
  id: number;
  title: string;
  wbs?: string;
  start?: Date;
  finish?: Date;
  critical?: boolean;
}

export type TaskIndex = Record<number, TaskDates>;

export function indexTasks(tasks: TaskDates[]): TaskIndex {
  const out: TaskIndex = {};
  tasks.forEach((t) => {
    out[t.id] = t;
  });
  return out;
}

export const DEFAULT_TASK_DUE_DAYS = 30;

function shift(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export interface ResolvedPayment {
  invoiceDate?: string;
  dueDate?: string;
  /** Platba je navázaná na úkol a datumy z něj opravdu vznikly. */
  fromSchedule: boolean;
  /** Platba je navázaná na úkol, který už neexistuje nebo nemá termín — platí ručně zadané datumy. */
  brokenLink: boolean;
}

/** Datum faktury a splatnost platby: z navázaného úkolu, jinak ručně zadané. */
export function resolvePayment(p: PlannedPayment, tasks: TaskIndex): ResolvedPayment {
  if (p.taskId === undefined) {
    return { invoiceDate: p.invoiceDate, dueDate: p.dueDate, fromSchedule: false, brokenLink: false };
  }
  const task = tasks[p.taskId];
  const anchor = task ? (p.taskAnchor === 'start' ? task.start : task.finish) : undefined;
  if (!task || !anchor) {
    return { invoiceDate: p.invoiceDate, dueDate: p.dueDate, fromSchedule: false, brokenLink: true };
  }
  const invoice = shift(dayOf(anchor), Math.round(p.taskOffsetDays ?? 0));
  const due = shift(invoice, Math.max(0, Math.round(p.taskDueDays ?? DEFAULT_TASK_DUE_DAYS)));
  return { invoiceDate: dayText(invoice), dueDate: dayText(due), fromSchedule: true, brokenLink: false };
}

/** Platby s datumy dosazenými z harmonogramu (původní pole `invoiceDate` a `dueDate` se u navázaných přepíšou jen ve výsledku). */
export function applySchedule(payments: PlannedPayment[], tasks: TaskIndex): PlannedPayment[] {
  return payments.map((p) => {
    if (p.taskId === undefined) {
      return p;
    }
    const r = resolvePayment(p, tasks);
    return r.fromSchedule ? { ...p, invoiceDate: r.invoiceDate, dueDate: r.dueDate } : p;
  });
}

export interface DeliveryOrder {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  budgetItemId?: string;
  deliveryDate?: Date;
}

export interface DeliveryConflict {
  itemId: string;
  itemName: string;
  orderNumber: string;
  taskTitle: string;
  /** Termín dodání objednávky a zahájení úkolu. */
  delivery: Date;
  taskStart: Date;
  /** O kolik pracovních dnů dodávka přichází po zahájení úkolu. */
  lateWorkdays: number;
  /** Úkol je na kritické cestě — zpoždění posune konec projektu. */
  critical: boolean;
  message: string;
}

const ACTIVE: OrderStatus[] = [OrderStatus.KeSchvaleni, OrderStatus.Schvaleno, OrderStatus.Odeslano];

const fmt = (d: Date): string => `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;

/**
 * Objednávky položek navázaných na úkol, jejichž dodání je po zahájení úkolu. Dodané, uzavřené, stornované a zamítnuté
 * objednávky se nehlásí (už nic neposouvají); hlásí se jen ty, které na dodání teprve čekají.
 */
export function deliveryConflicts(items: BudgetItem[], orders: DeliveryOrder[], tasks: TaskIndex): DeliveryConflict[] {
  const out: DeliveryConflict[] = [];
  items.forEach((item) => {
    if (item.taskId === undefined) {
      return;
    }
    const task = tasks[item.taskId];
    if (!task || !task.start) {
      return;
    }
    const start = dayOf(task.start);
    orders
      .filter((o) => o.budgetItemId === item.id && o.deliveryDate && ACTIVE.indexOf(o.status) !== -1)
      .forEach((o) => {
        const delivery = dayOf(o.deliveryDate as Date);
        if (delivery.getTime() <= start.getTime()) {
          return;
        }
        // Dodání v den zahájení je v pořádku; zpoždění se počítá v pracovních dnech od zahájení.
        const late = Math.max(1, workdaysBetween(CZECH_WORKDAYS, start, delivery));
        const critical = !!task.critical;
        out.push({
          itemId: item.id,
          itemName: item.description,
          orderNumber: o.orderNumber,
          taskTitle: task.title,
          delivery,
          taskStart: start,
          lateWorkdays: late,
          critical,
          message: `Objednávka ${o.orderNumber} (${item.description || 'položka'}) se dodá ${fmt(delivery)}, ale úkol „${task.title}“ začíná ${fmt(start)} — zpoždění ${late} pracovních dnů${critical ? '; úkol je na kritické cestě, posune se konec projektu a může ohrozit smluvní termín' : ''}.`
        });
      });
  });
  return out.sort((a, b) => b.lateWorkdays - a.lateWorkdays);
}

/** Úkoly pro výběr (číslo + název), v pořadí harmonogramu. */
export function taskLabel(t: TaskDates): string {
  return `${t.wbs ? `${t.wbs} ` : ''}${t.title || '(bez názvu)'}`;
}

/** Počet navázaných plateb a položek na úkol — pro upozornění při mazání úkolu. */
export function linksToTask(taskId: number, payments: PlannedPayment[], items: BudgetItem[]): { payments: number; items: number } {
  return { payments: payments.filter((p) => p.taskId === taskId).length, items: items.filter((i) => i.taskId === taskId).length };
}
