import { PrivacyAvatar } from '@/components/personal/common/PrivacyAvatar';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { UsernameDisplay } from '@/components/ui/common/UsernameDisplay';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import {
  $contactRequestsState,
  type SentRequestEntry,
} from '@/state/personalState/contacts/personal.state.contacts';
import { formatRelativeTimeShort } from '@/utils/commonUtils/util.date';
import { useValue } from '@legendapp/state/react';
import type { GestureResponderEvent } from 'react-native';
import { Pressable } from 'react-native';
import styles from '../requests.styles';

export type SentRowProps = {
  id: string;
  onOpenActions: (item: SentRequestEntry, event?: GestureResponderEvent) => void;
  onUndo: (item: SentRequestEntry) => void;
};

export default function SentRequestRow({ id, onOpenActions, onUndo }: SentRowProps) {
  const { handlePressIn } = pressableAnimation();
  const item = useValue($contactRequestsState.sentById[id]);
  if (!item) {
    return null;
  }

  const status = item.status?.toLowerCase();
  const disabled = status === 'declined';
  const canUndo = status !== 'declined';

  const displayName = item.nickname ?? item.name;
  return (
    <ThemedView style={styles.row}>
      <Pressable
        disabled={disabled}
        style={({ pressed }) => [
          {
            opacity: pressed ? 0.1 : 1,
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
          },
          disabled ? styles.rowDisabled : null,
        ]}
        onPressIn={handlePressIn}
        onPress={(event) => onOpenActions(item, event)}
      >
        <PrivacyAvatar uri={item.avatarUrl} name={displayName} size={48} colorKey={item.id} />
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
            Sent {formatRelativeTimeShort(item.requestedAt)}
          </ThemedText>
          {/* Bio intentionally hidden in sent request card */}
          {status === 'declined' ? (
            <ThemedView style={[styles.badge, styles.badgeDeclined]}>
              <ThemedText type='small' selectable={false} style={styles.badgeText}>
                Declined
              </ThemedText>
            </ThemedView>
          ) : status === 'accepted' ? (
            <ThemedView style={[styles.badge, styles.badgeAccepted]}>
              <ThemedText type='small' selectable={false} style={styles.badgeText}>
                Accepted
              </ThemedText>
            </ThemedView>
          ) : null}
        </ThemedView>
      </Pressable>
      {canUndo ? (
        <ThemedView style={styles.pendingActionsRow}>
          <Pressable
            onPressIn={handlePressIn}
            onPress={() => onUndo(item)}
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
              Undo{"      "}
            </ThemedText>
          </Pressable>
        </ThemedView>
      ) : null}
    </ThemedView>
  );
}
