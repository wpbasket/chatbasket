import { AppButton } from '@/components/ui/common/AppButton';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
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
        <AppButton
          onPress={onPressPending}
          style={styles.pendingPill}
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
        </AppButton>

        <ThemedText type='small' style={styles.headerSubtitle} selectable={false}>
          {subtitle}
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.addButtonRow}>
        {selectedTab === 'contacts' ? (
          <AppButton
            label="Add contact"
            icon={<IconSymbol name='account.add' size={20} />}
            onPress={onPressAddContact}
            labelStyle={styles.addButtonLabel}
            style={styles.addButton}
          />
        ) : null}
      </ThemedView>
    </ThemedView>
  );
}

