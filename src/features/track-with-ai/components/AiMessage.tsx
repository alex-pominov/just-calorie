import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/modules/theme';

import { addFailedCopy, errorCopy, OVER_LIMIT_COPY } from '../services/chat-copy.service';
import { isOverEntryLimit } from '../services/track-chat.service';
import type { AiMessage as AiMessageModel } from '../types/track-chat.types';
import { EstimateCard } from './EstimateCard';

interface AiMessageProps {
  message: AiMessageModel;
  /** The day Add writes to, as the chat names it. */
  dayName: string;
  onAdd: (message: AiMessageModel) => void;
}

const SENTENCE = 'font-manrope-regular text-body text-primary';

/** Left-aligned (frame 9:3386): the model's sentence, then the estimate card when it carries a kcal. */
export const AiMessage = ({ message, dayName, onAdd }: AiMessageProps) => {
  if (message.status === 'pending') {
    // iOS reads the indicator as 'In progress', and hides it only while no ancestor is an accessibility
    // element; so 'Estimating' is a sibling laid over it, never its parent (seen on JC track).
    return (
      <View testID={`ai-message-${message.id}`} className="self-start py-3">
        <View
          testID="estimating-indicator"
          collapsable={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <ActivityIndicator color={colors['content-muted']} />
        </View>
        <View testID="estimating" accessible accessibilityLabel="Estimating" style={StyleSheet.absoluteFill} />
      </View>
    );
  }

  if (message.status === 'error') {
    return (
      <View testID={`ai-message-${message.id}`} className="max-w-65 self-start">
        <Text accessibilityRole="alert" className="font-manrope-regular text-body text-content-secondary">
          {errorCopy(message.error)}
        </Text>
      </View>
    );
  }

  const isOverLimit = message.kcal !== null && isOverEntryLimit(message.kcal);

  return (
    <View testID={`ai-message-${message.id}`} className="max-w-65 gap-2 self-start">
      <Text className={SENTENCE}>{message.reply}</Text>
      {message.kcal === null ? null : (
        <EstimateCard
          kcal={message.kcal}
          dayName={dayName}
          add={isOverLimit ? null : { state: message.addState, onAdd: () => onAdd(message) }}
        />
      )}
      {isOverLimit ? (
        <Text className="font-manrope-regular text-label text-content-secondary">{OVER_LIMIT_COPY}</Text>
      ) : null}
      {message.addState === 'failed' ? (
        <Text accessibilityRole="alert" className="font-manrope-regular text-label text-coral">
          {addFailedCopy(dayName)}
        </Text>
      ) : null}
    </View>
  );
};
