import { spacing } from '@/modules/theme';

const px = (value: string) => Number.parseFloat(value);

const CELL_WIDTH = px(spacing[12]);
const COLUMN_GAP = px(spacing[2]);
const EDGE_INSET = px(spacing[1]);

interface WeekRow {
  rowWidth: number;
  columnCount: number;
}

export interface WeekGeometry {
  cellWidth: number;
  gap: number;
  inset: number;
  columnXs: readonly number[];
}

/** Columns at the frame's 48pt where they fit and narrower where they do not, centred to the whole point. */
export function weekGeometry({ rowWidth, columnCount }: WeekRow): WeekGeometry {
  const gaps = COLUMN_GAP * (columnCount - 1);
  const cellWidth = Math.min(CELL_WIDTH, (rowWidth - EDGE_INSET * 2 - gaps) / columnCount);
  const inset = Math.max(EDGE_INSET, Math.floor((rowWidth - cellWidth * columnCount - gaps) / 2));

  return {
    cellWidth,
    gap: COLUMN_GAP,
    inset,
    columnXs: Array.from({ length: columnCount }, (_, column) => inset + column * (cellWidth + COLUMN_GAP)),
  };
}
