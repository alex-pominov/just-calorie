import { Canvas, createPicture, Group, Path, Picture, Skia } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { interpolateColor, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors } from '@/modules/theme';

import { useBowlWorld } from '../hooks/useBowlWorld';
import {
  BOWL_HEADROOM,
  BOWL_HEIGHT,
  BOWL_WIDTH,
  TRACK_MIDLINE_PATH,
  TRACK_PATH,
  TRACK_STROKE_WIDTH,
} from '../services/bowl-geometry.service';
import { drawnOpacity, drawnRadius, tintProgress } from '../services/bowl-world.service';
import type { BallKind, BowlState } from '../types/bowl.types';

interface BowlProps {
  state: BowlState;
  accessibilityLabel: string;
}

const BALL_COLOR = {
  placeholder: Skia.Color(colors['white-100']),
  eaten: Skia.Color(colors.primary),
  'carry-over': Skia.Color(colors.coral),
  overflow: Skia.Color(colors.coral),
} satisfies Record<BallKind, Float32Array>;

const TRACK = Skia.Path.MakeFromSVGString(TRACK_PATH);
const TRACK_MIDLINE = Skia.Path.MakeFromSVGString(TRACK_MIDLINE_PATH);
const TRACK_CHANGE = { duration: 400 };
const FRAME_STYLE = { width: BOWL_WIDTH, height: BOWL_HEIGHT } as const;
const CANVAS_TOP = -BOWL_HEADROOM;
const CANVAS_HEIGHT = BOWL_HEIGHT + BOWL_HEADROOM;

/** A re-coloured pile ball's colour on its way from its old colour to its new one. */
function tintedColor(kind: BallKind, progress: number): Float32Array {
  'worklet';
  const to = BALL_COLOR[kind];
  const from = BALL_COLOR[kind === 'carry-over' ? 'eaten' : 'carry-over'];

  return to.map((channel, index) => (from[index] ?? channel) + (channel - (from[index] ?? channel)) * progress);
}

// One image for the whole bowl: its balls are a picture of the figures above it, not separate elements. The
// canvas reaches BOWL_HEADROOM above the bowl's frame, where new balls appear, and out to the screen's edges,
// where overflow piles up, without moving the layout: the bowl is centred on the screen.
export const Bowl = ({ state, accessibilityLabel }: BowlProps) => {
  const { width } = useWindowDimensions();
  const spill = Math.max(0, (width - BOWL_WIDTH) / 2);
  const canvasLeft = -spill;
  const picture = useBowlWorld(state.counts, spill);
  const fill = useSharedValue(state.arcFraction);
  const overCap = useSharedValue(state.isOverCap ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(state.arcFraction, TRACK_CHANGE);
    overCap.value = withTiming(state.isOverCap ? 1 : 0, TRACK_CHANGE);
  }, [state.arcFraction, state.isOverCap, fill, overCap]);

  const trackColor = useDerivedValue(() => interpolateColor(overCap.value, [0, 1], [colors['white-100'], colors.coral]));
  const arcColor = useDerivedValue(() => interpolateColor(overCap.value, [0, 1], [colors.primary, colors.coral]));
  const arcStart = useDerivedValue(() => 0.5 - fill.value / 2);
  const arcEnd = useDerivedValue(() => 0.5 + fill.value / 2);
  const arcOpacity = useDerivedValue(() => (fill.value > 0.001 ? 1 : 0));
  const balls = useDerivedValue(() => {
    const { balls: current, time } = picture.value;
    const paint = Skia.Paint();

    return createPicture((canvas) => {
      for (const ball of current) {
        const progress = tintProgress(ball, time);
        const color = progress < 1 ? tintedColor(ball.kind, progress) : BALL_COLOR[ball.kind];

        // The colour's own alpha times the fade: the empty bowl's balls are a translucent white.
        paint.setColor(color);
        paint.setAlphaf((color[3] ?? 1) * drawnOpacity(ball, time));
        canvas.drawCircle(ball.x, ball.y, drawnRadius(ball, time), paint);
      }
    });
  });

  return (
    <View
      style={FRAME_STYLE}
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Canvas
        style={{ position: 'absolute', top: CANVAS_TOP, left: canvasLeft, width: BOWL_WIDTH + 2 * spill, height: CANVAS_HEIGHT }}
      >
        <Group transform={[{ translateX: spill }, { translateY: BOWL_HEADROOM }]}>
          {TRACK === null ? null : <Path path={TRACK} color={trackColor} />}
          {TRACK_MIDLINE === null ? null : (
            <Path
              path={TRACK_MIDLINE}
              style="stroke"
              strokeWidth={TRACK_STROKE_WIDTH}
              strokeCap="round"
              color={arcColor}
              opacity={arcOpacity}
              start={arcStart}
              end={arcEnd}
            />
          )}
          <Picture picture={balls} />
        </Group>
      </Canvas>
    </View>
  );
};
