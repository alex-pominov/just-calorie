import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { weekGeometry } from './week-geometry';

export interface CalendarWeekRowCell {
  key: string;
  content: ReactNode;
}

interface CalendarWeekRowProps {
  cells: readonly CalendarWeekRowCell[];
  testID?: string | undefined;
}

/** A full-width row of seven columns; the weekday headings and every week use it, so their columns line up. */
export const CalendarWeekRow = ({ cells, testID }: CalendarWeekRowProps) => {
  const { width } = useWindowDimensions();
  const { cellWidth, gap, inset } = weekGeometry(width);

  return (
    <View testID={testID} className="flex-row" style={{ paddingLeft: inset, columnGap: gap }}>
      {cells.map(({ key, content }) => (
        <View key={key} style={{ width: cellWidth }}>
          {content}
        </View>
      ))}
    </View>
  );
};
