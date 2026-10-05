import { useEffect, useState } from 'react';

import { millisecondsUntilNextDay, toDayKey } from '../services/day-key.service';

export function useTodayKey(): string {
  const [todayKey, setTodayKey] = useState(() => toDayKey(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRollover = () => {
      timer = setTimeout(() => {
        setTodayKey(toDayKey(new Date()));
        scheduleRollover();
      }, millisecondsUntilNextDay(new Date()));
    };

    scheduleRollover();

    return () => clearTimeout(timer);
  }, []);

  return todayKey;
}
