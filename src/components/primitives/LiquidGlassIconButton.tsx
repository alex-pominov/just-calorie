import type { ReactElement } from 'react';
import { cva } from 'class-variance-authority';
import { cssInterop } from 'nativewind';
import { Pressable, View } from 'react-native';
import { GlassView as GlassViewBase, isLiquidGlassAvailable } from 'expo-glass-effect';

import { cn } from '@/utils/tailwind';
import { colors } from '@/modules/theme';

type GlassTone = 'dark' | 'light';

interface LiquidGlassIconButtonProps {
  icon: ReactElement;
  accessibilityLabel: string;
  /** Dark glass by default; light is the pop-ups' confirm button (Figma 9:4033). */
  tone?: GlassTone | undefined;
  disabled?: boolean | undefined;
  onPress?: (() => void) | undefined;
}

// GlassView is not a core component: without this registration NativeWind drops its className silently.
const GlassView = cssInterop(GlassViewBase, { className: { target: 'style' } });

const SURFACE = 'h-12 w-12 items-center justify-center rounded-full';

const GLASS = {
  dark: { colorScheme: 'dark', tintColor: colors['white-50'] },
  light: { colorScheme: 'light', tintColor: colors['surface-light'] },
} as const satisfies Record<GlassTone, { colorScheme: 'dark' | 'light'; tintColor: string }>;

const flatSurface = cva(SURFACE, {
  variants: { tone: { dark: 'bg-white-50', light: 'bg-surface-light' } },
});

export const LiquidGlassIconButton = ({
  icon,
  accessibilityLabel,
  tone = 'dark',
  disabled = false,
  onPress,
}: LiquidGlassIconButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    className={cn(disabled && 'opacity-50')}
  >
    {isLiquidGlassAvailable() ? (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={GLASS[tone].colorScheme}
        tintColor={GLASS[tone].tintColor}
        isInteractive
        className={SURFACE}
      >
        {icon}
      </GlassView>
    ) : (
      <View className={flatSurface({ tone })}>{icon}</View>
    )}
  </Pressable>
);
