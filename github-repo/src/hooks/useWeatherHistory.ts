import { useState, useEffect, useRef } from 'react';
import { subDays, subMonths, subYears, format, startOfDay, endOfDay, isValid } from 'date-fns';

export type DatasetMode = 'TORNADO' | 'WARNING';
export type TornadoLayer = 'tracks' | 'points' | 'areas';
export type WarningType = 'ALL' | 'TO' | 'SV';

export interface DateRange {
  from: Date;
  to: Date;
}

export function useWeatherHistory() {
  const [mode, setMode] = useState<DatasetMode>('TORNADO');
  
  // TORNADO HISTORY state
  const [activeTornadoLayers, setActiveTornadoLayers] = useState<Set<TornadoLayer>>(new Set(['tracks']));
  
  // WARNING HISTORY state
  const [warningType, setWarningType] = useState<WarningType>('ALL');

  // Shared Date Range
  const today = startOfDay(new Date());
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(today, 7),
    to: endOfDay(today),
  });

  return {
    mode,
    setMode,
    activeTornadoLayers,
    setActiveTornadoLayers,
    warningType,
    setWarningType,
    dateRange,
    setDateRange,
  };
}
