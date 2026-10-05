import { Alert } from 'react-native';

import type { DaySummary } from '@/features/tracking';
import {
  dayFigures,
  useAddEntry,
  useDaySummaries,
  useDaySummary,
  useEnsureDailyCap,
  useSetCarryOverDecision,
} from '@/features/tracking';

import { bowlLabel } from '../services/bowl-label.service';
import { bowlState } from '../services/bowl-counts.service';
import { monthShortName, weekStripDays, weekStripRange } from '../services/week-strip.service';
import type { CarryOverOffer, Today, TodayView } from '../types/today.types';
import { useLastRead } from './useLastRead';
import { useShownDay } from './useShownDay';

function carryOverOffer(summary: DaySummary): CarryOverOffer | null {
  return summary.carryOverKcal > 0 ? { kcal: summary.carryOverKcal, added: summary.carryOverAdded === true } : null;
}

function todayView(summary: DaySummary | null, todayKey: string): TodayView | null {
  const figures = summary === null ? null : dayFigures(summary);

  if (summary === null || figures === null) {
    return null;
  }

  const addedCarryOverKcal = summary.carryOverAdded === true ? summary.carryOverKcal : 0;

  return {
    dayKey: summary.dayKey,
    isToday: summary.dayKey === todayKey,
    figures,
    bowl: bowlState({ totalKcal: summary.totalKcal, addedCarryOverKcal, capKcal: figures.capKcal }),
    bowlLabel: bowlLabel(figures, addedCarryOverKcal),
    carryOver: carryOverOffer(summary),
  };
}

function reportWriteFailure(error: unknown): void {
  console.error('Could not save', error);
  Alert.alert("Couldn't save", 'Try again.');
}

/**
 * The shown day's figures, bowl and week, read back from SQLite after every write, and the actions on them. Until a
 * newly shown day is read, the last day read stays up, and every action writes to the day on screen.
 */
export function useToday(): Today {
  useEnsureDailyCap();
  const { shown, select, showPrevious, showNext } = useShownDay();
  const summary = useLastRead(useDaySummary(shown.dayKey));
  const days = useLastRead(useDaySummaries(weekStripRange(shown)));
  const addEntry = useAddEntry();
  const setCarryOverDecision = useSetCarryOverDecision();
  const view = todayView(summary, shown.todayKey);
  const dayKey = view?.dayKey ?? shown.dayKey;

  return {
    dayKey,
    monthName: monthShortName(dayKey),
    // The day on screen, so the strip never highlights a day the figures and actions have not reached yet.
    weekDays: days === null ? null : weekStripDays({ dayKey, todayKey: shown.todayKey }, days),
    view,
    addKcal: (kcal) => {
      addEntry({ dayKey, kind: 'add', kcal }).catch(reportWriteFailure);
    },
    toggleCarryOver: () => {
      if (view?.carryOver) {
        setCarryOverDecision({ dayKey, added: !view.carryOver.added }).catch(reportWriteFailure);
      }
    },
    selectDay: select,
    showPreviousDay: showPrevious,
    showNextDay: showNext,
  };
}
