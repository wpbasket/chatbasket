import { PrivacyAvatar } from '@/components/personal/common/PrivacyAvatar';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { UsernameDisplay } from '@/components/ui/common/UsernameDisplay';
import { FontAwesome5Icon } from '@/components/ui/fonts/fontAwesome5';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { useLegend$ } from '@/hooks/commonHooks/hooks.useLegend';
import {
    $contactsState,
    type ContactEntry,
} from '@/state/personalState/contacts/personal.state.contacts';
import { Pressable } from 'react-native';
import { styles } from '../contacts.styles';

export type ContactRowProps = {
  id: string;
  kind: 'contacts' | 'addedYou';
  onOpenActions: (item: ContactEntry, event?: any) => void;
};

export default function ContactRow({ id, kind, onOpenActions }: ContactRowProps) {
  const { handlePressIn } = pressableAnimation();
  const item = useLegend$(
    kind === 'contacts'
      ? $contactsState.contactsById[id]
      : $contactsState.addedYouById[id]
  );

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
        {/* Bio intentionally hidden in contact card */}
      </ThemedView>
      {item.isMutual ? (
        <ThemedView style={styles.badge}>
          <FontAwesome5Icon name='account.friends' size={14} />
          <ThemedText type='small' selectable={false}>Mutual</ThemedText>
        </ThemedView>
      ) : null}
    </Pressable>
  );
}
