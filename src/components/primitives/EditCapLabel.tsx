import type { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

import { EditIcon } from '@/assets/icons';

interface EditCapLabelProps {
  children: ReactNode;
  onPress?: (() => void) | undefined;
}

interface EditCapFigureProps {
  children: ReactNode;
}

// The emphasised run inside an EditCapLabel sentence (Figma 5:2197, character style ts1). A part rather
// than a prop, so a translated sentence can place the figure wherever its grammar puts it.
export const EditCapFigure = ({ children }: EditCapFigureProps) => (
  <Text className="font-manrope-bold text-primary">{children}</Text>
);

export const EditCapLabel = ({ children, onPress }: EditCapLabelProps) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    className="flex-row items-center justify-center gap-3 rounded-md bg-white-50 py-2 pl-4 pr-3"
  >
    <Text className="text-center font-manrope-medium text-body text-content-muted">{children}</Text>
    <EditIcon />
  </Pressable>
);
