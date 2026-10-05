import { ScrollView } from 'react-native';

import { CloseIcon } from '@/assets/icons';
import { CalendarDayCell } from '@/components/calendar';
import { OvercapSelector, Tab } from '@/components/form';
import { EditCapFigure, EditCapLabel, LiquidGlassIconButton, Logo } from '@/components/primitives';
import { SheetSection } from '@/features/component-sheet';
import { StorageProbe } from '@/features/tracking';

const TAB_LABELS = { add: 'Add', remove: 'Remove' };

export default function ComponentSheet() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-ink-900"
      contentContainerClassName="gap-6 px-4 py-6"
    >
      <SheetSection caption="Storage probe — today, read back from SQLite">
        <StorageProbe />
      </SheetSection>
      <SheetSection caption="Logo">
        <Logo accessibilityLabel="Just Calorie" />
      </SheetSection>
      <SheetSection caption="Calendar day — unfilled">
        <CalendarDayCell variant="unfilled" selected={false} weekday="Mo" day="28" accessibilityLabel="Monday 28, unfilled" />
      </SheetSection>
      <SheetSection caption="Calendar day — overaten">
        <CalendarDayCell variant="overaten" selected={false} weekday="Tu" day="29" accessibilityLabel="Tuesday 29, over the cap" />
      </SheetSection>
      <SheetSection caption="Calendar day — on track">
        <CalendarDayCell variant="on-track" selected={false} weekday="Th" day="1" accessibilityLabel="Thursday 1, on track" />
      </SheetSection>
      <SheetSection caption="Calendar day — today">
        <CalendarDayCell variant="today" selected weekday="Sa" day="3" accessibilityLabel="Saturday 3, today" />
      </SheetSection>
      <SheetSection caption="Calendar day — tomorrow">
        <CalendarDayCell variant="tomorrow" selected={false} weekday="Mo" day="28" accessibilityLabel="Monday 28, tomorrow" />
      </SheetSection>
      <SheetSection caption="Tab — Add">
        <Tab selected="add" labels={TAB_LABELS} />
      </SheetSection>
      <SheetSection caption="Tab — Remove">
        <Tab selected="remove" labels={TAB_LABELS} />
      </SheetSection>
      <SheetSection caption="Overcap selector — added">
        <OvercapSelector added label="+400" />
      </SheetSection>
      <SheetSection caption="Overcap selector — not added">
        <OvercapSelector added={false} label="+400" />
      </SheetSection>
      <SheetSection caption="Edit-cap label">
        <EditCapLabel>
          <EditCapFigure>1200</EditCapFigure> from 1200 kcal left
        </EditCapLabel>
      </SheetSection>
      <SheetSection caption="Liquid Glass icon button">
        <LiquidGlassIconButton icon={<CloseIcon />} accessibilityLabel="Close" />
      </SheetSection>
    </ScrollView>
  );
}
