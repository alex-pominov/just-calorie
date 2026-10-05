import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

interface SheetSectionProps {
  caption: string;
  children: ReactNode;
}

export const SheetSection = ({ caption, children }: SheetSectionProps) => (
  <View className="items-start gap-2">
    <Text className="font-manrope-semibold text-caption text-content-tertiary">{caption}</Text>
    {children}
  </View>
);
