import { CALENDAR_DAYS, CZECH_WORKDAYS, addWorkdays, czechHolidays, diffDays, nextWorkday, prevWorkday, workdaysBetween } from './workCalendar';

const d = (y: number, m: number, day: number): Date => new Date(y, m - 1, day);

describe('pracovní kalendář', () => {
  it('české svátky 2026 včetně Velikonoc (Velký pátek 3. 4., Velikonoční pondělí 6. 4.)', () => {
    const set = czechHolidays(2026).map((x) => `${x.getMonth() + 1}-${x.getDate()}`);
    expect(set).toEqual(expect.arrayContaining(['1-1', '5-1', '5-8', '7-5', '7-6', '9-28', '10-28', '11-17', '12-24', '12-25', '12-26', '4-6', '4-3']));
    expect(czechHolidays(2026)).toHaveLength(13);
    expect(czechHolidays(2015)).toHaveLength(12);
  });

  it('víkend a svátek nejsou pracovní dny', () => {
    expect(CZECH_WORKDAYS.isWorkday(d(2026, 10, 3))).toBe(false); // sobota
    expect(CZECH_WORKDAYS.isWorkday(d(2026, 10, 28))).toBe(false); // úterý, státní svátek
    expect(CZECH_WORKDAYS.isWorkday(d(2026, 10, 7))).toBe(true);
    expect(CALENDAR_DAYS.isWorkday(d(2026, 10, 3))).toBe(true);
  });

  it('nextWorkday a prevWorkday', () => {
    expect(nextWorkday(CZECH_WORKDAYS, d(2026, 10, 3))).toEqual(d(2026, 10, 5));
    expect(prevWorkday(CZECH_WORKDAYS, d(2026, 10, 4))).toEqual(d(2026, 10, 2));
    expect(nextWorkday(CZECH_WORKDAYS, d(2026, 10, 7))).toEqual(d(2026, 10, 7));
  });

  it('přičítání pracovních dnů přeskakuje víkendy a svátky', () => {
    expect(addWorkdays(CZECH_WORKDAYS, d(2026, 10, 2), 1)).toEqual(d(2026, 10, 5)); // pátek + 1 = pondělí
    expect(addWorkdays(CZECH_WORKDAYS, d(2026, 10, 27), 1)).toEqual(d(2026, 10, 29)); // 28. 10. je svátek
    expect(addWorkdays(CZECH_WORKDAYS, d(2026, 10, 5), -1)).toEqual(d(2026, 10, 2));
    expect(addWorkdays(CZECH_WORKDAYS, d(2026, 10, 5), 0)).toEqual(d(2026, 10, 5));
    expect(addWorkdays(CALENDAR_DAYS, d(2026, 10, 2), 3)).toEqual(d(2026, 10, 5));
  });

  it('počet pracovních dnů mezi daty (i záporný)', () => {
    expect(workdaysBetween(CZECH_WORKDAYS, d(2026, 10, 5), d(2026, 10, 9))).toBe(4);
    expect(workdaysBetween(CZECH_WORKDAYS, d(2026, 10, 2), d(2026, 10, 5))).toBe(1);
    expect(workdaysBetween(CZECH_WORKDAYS, d(2026, 10, 9), d(2026, 10, 5))).toBe(-4);
    expect(workdaysBetween(CZECH_WORKDAYS, d(2026, 10, 5), d(2026, 10, 5))).toBe(0);
    expect(diffDays(d(2026, 10, 1), d(2026, 10, 31))).toBe(30);
  });
});
