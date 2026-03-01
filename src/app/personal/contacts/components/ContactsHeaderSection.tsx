import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { Pressable } from 'react-native';
import styles from '../contacts.styles';

export type ContactsHeaderSectionProps = {
  pendingCount: number;
  selectedTab: 'contacts' | 'addedYou';
  contactsCount: number;
  addedYouCount: number;
  error: string | null | undefined;
  lastFetchedAt: any;
  onPressPending: () => void;
  onPressAddContact: () => void;
};

export default function ContactsHeaderSection({
  pendingCount,
  selectedTab,
  contactsCount,
  addedYouCount,
  error,
  lastFetchedAt,
  onPressPending,
  onPressAddContact,
}: ContactsHeaderSectionProps) {
  const subtitle =
    lastFetchedAt != null && !error
      ? selectedTab === 'contacts'
        ? contactsCount === 0
          ? "You haven't added anyone yet."
          : `${contactsCount} saved contact${contactsCount === 1 ? '' : 's'}.`
        : addedYouCount === 0
          ? 'No one has added you yet.'
          : `${addedYouCount} person${addedYouCount === 1 ? '' : 's'} added you.`
      : '';

  return (
    <ThemedView style={styles.headerSection}>
      <ThemedView style={styles.headerText}>
        <Pressable
          onPress={onPressPending}
          style={({ pressed }) => [
            styles.pendingPill,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <ThemedText
            type='small'
            style={styles.pendingPillText}
            selectable={false}
          >
            {'Pending requests: '}
            <ThemedText
              type='small'
              style={
                pendingCount === 0
                  ? styles.pendingPillTextPrimary
                  : styles.pendingPillTextWarning
              }
              selectable={false}
            >
              {pendingCount}{'  '}
            </ThemedText>
          </ThemedText>
        </Pressable>

        <ThemedText type='small' style={styles.headerSubtitle} selectable={false}>
          {subtitle}
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.addButtonRow}>
        {selectedTab === 'contacts' ? (
          <Pressable
            onPress={onPressAddContact}
            style={({ pressed }) => [
              styles.addButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <IconSymbol name='account.add' size={20} />
            <ThemedText
              type='small'
              style={styles.addButtonLabel}
              selectable={false}
            >
              Add contact
            </ThemedText>
          </Pressable>
        ) : null}
      </ThemedView>
    </ThemedView>
  );
}
