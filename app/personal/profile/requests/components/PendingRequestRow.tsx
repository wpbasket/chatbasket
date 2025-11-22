import { PrivacyAvatar } from '@/components/personal/common/PrivacyAvatar';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { UsernameDisplay } from '@/components/ui/common/UsernameDisplay';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import {
  $contactRequestsState,
  type PendingRequestEntry,
} from '@/state/personalState/contacts/personal.state.contacts';
import { formatRelativeTimeShort } from '@/utils/commonUtils/util.date';
import { useValue } from '@legendapp/state/react';
import type { GestureResponderEvent } from 'react-native';
import { Pressable } from 'react-native';
import styles from '../requests.styles';

export type PendingRowProps = {
  id: string;
  onOpenActions: (item: PendingRequestEntry, event?: GestureResponderEvent) => void;
  onAccept: (item: PendingRequestEntry) => void;
  onReject: (item: PendingRequestEntry) => void;
};

export default function PendingRequestRow({ id, onOpenActions, onAccept, onReject }: PendingRowProps) {
  const { handlePressIn } = pressableAnimation();
  const item = useValue($contactRequestsState.pendingById[id]);

  if (!item) {
    return null;
  }

  const displayName = item.nickname ?? item.name;
  return (
    <ThemedView style={styles.row}>
      <Pressable
        style={({ pressed }) => [
          {
            opacity: pressed ? 0.1 : 1,
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
          },
        ]}
        onPressIn={handlePressIn}
        onPress={(event) => onOpenActions(item, event)}
      >
        <PrivacyAvatar uri={item.avatarUrl} name={displayName} size={48} />
        <ThemedView style={styles.rowContent}>
          <ThemedText type='semibold' style={styles.rowName} selectable>
            {displayName}
          </ThemedText>
          <ThemedText type='small' style={styles.rowUsername} selectable>
            <UsernameDisplay
              username={item.username}
              lettersStyle={styles.usernameLetters}
              numbersStyle={styles.usernameNumbers}
            />
          </ThemedText>
          <ThemedText type='small' style={styles.meta} selectable={false}>
            Requested {formatRelativeTimeShort(item.requestedAt)}
          </ThemedText>
          {/* Bio intentionally hidden in pending request card */}
        </ThemedView>
      </Pressable>
      <ThemedView style={styles.pendingActionsRow}>
        <Pressable
          onPressIn={handlePressIn}
          onPress={() => onAccept(item)}
          style={({ pressed }) => [
            styles.pendingActionButton,
            pressed ? styles.pendingActionButtonPressed : null,
          ]}
        >
          <ThemedText
            type='smallBold'
            style={styles.pendingActionButtonLabelPrimary}
            selectable={false}
          >
            Accept{"    "}
          </ThemedText>
        </Pressable>
        <Pressable
          onPressIn={handlePressIn}
          onPress={() => onReject(item)}
          style={({ pressed }) => [
            styles.pendingActionButton,
            pressed ? styles.pendingActionButtonPressed : null,
          ]}
        >
          <ThemedText
            type='smallBold'
            style={styles.pendingActionButtonLabelDanger}
            selectable={false}
          >
            Decline{"    "}
          </ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}
