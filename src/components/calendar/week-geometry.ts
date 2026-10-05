import { spacing } from '@/modules/theme';

const DAYS_PER_WEEK = 7;

const px = (value: string) => Number.parseFloat(value);

const CELL_WIDTH = px(spacing[12]);
const COLUMN_GAP = px(spacing[2]);
const EDGE_INSET = px(spacing[1]);

export interface WeekGeometry {
  cellWidth: number;
  gap: number;
  inset: number;
  columnXs: readonly number[];
}

/** Seven columns at the frame's 48pt where they fit and narrower where they do not, centred to the whole point. */
export function weekGeometry(rowWidth: number): WeekGeometry {
  const gaps = COLUMN_GAP * (DAYS_PER_WEEK - 1);
  const cellWidth = Math.min(CELL_WIDTH, (rowWidth - EDGE_INSET * 2 - gaps) / DAYS_PER_WEEK);
  const inset = Math.max(EDGE_INSET, Math.floor((rowWidth - cellWidth * DAYS_PER_WEEK - gaps) / 2));

  return {
    cellWidth,
    gap: COLUMN_GAP,
    inset,
    columnXs: Array.from({ length: DAYS_PER_WEEK }, (_, column) => inset + column * (cellWidth + COLUMN_GAP)),
  };
}
