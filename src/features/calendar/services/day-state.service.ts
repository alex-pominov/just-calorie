import type { CalendarDayState, DayStatus } from '../types/calendar.types';

interface PositionedDay {
  dayKey: string;
  todayKey: string;
  status: DayStatus;
}

/** Position decides first (today, then any later day is future); every earlier day shows its status. */
export function deriveCalendarDayState({ dayKey, todayKey, status }: PositionedDay): CalendarDayState {
  if (dayKey === todayKey) {
    return 'today';
  }

  if (dayKey > todayKey) {
    return 'future';
  }

  return status;
}
