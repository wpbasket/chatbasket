import { PrivacyAvatar } from '@/components/personal/common/PrivacyAvatar';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { UsernameDisplay } from '@/components/ui/common/UsernameDisplay';
import { FontAwesome5Icon } from '@/components/ui/fonts/fontAwesome5';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { useLegend$ } from '@/hooks/commonHooks/hooks.useLegend';
import {
    $contactRequestsState,
    type PendingRequestEntry,
} from '@/state/personalState/contacts/personal.state.contacts';
import { formatRelativeTimeShort } from '@/utils/commonUtils/util.date';
import type { GestureResponderEvent } from 'react-native';
import { Pressable } from 'react-native';
import { styles } from '../requests.styles';

export type PendingRowProps = {
  id: string;
  onOpenActions: (item: PendingRequestEntry, event?: GestureResponderEvent) => void;
};

export default function PendingRequestRow({ id, onOpenActions }: PendingRowProps) {
  const { handlePressIn } = pressableAnimation();
  const item = useLegend$($contactRequestsState.pendingById[id]);

  if (!item) {
    return null;
  }

  const displayName = item.nickname ?? item.name;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.1 : 1 }]}
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
      <FontAwesome5Icon name='account.friends' size={16} />
    </Pressable>
  );
}
