import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { Pressable } from 'react-native';
import styles from '../contacts.styles';

export type ContactsSegmentTabsProps = {
  selectedTab: 'contacts' | 'addedYou';
  onChangeTab: (tab: 'contacts' | 'addedYou') => void;
};

export default function ContactsSegmentTabs({
  selectedTab,
  onChangeTab,
}: ContactsSegmentTabsProps) {
  return (
    <ThemedView style={styles.segmentContainer}>
      {(['contacts', 'addedYou'] as const).map((tab) => {
        const isActive = selectedTab === tab;
        return (
          <Pressable
            key={tab}
            style={({ pressed }) => [
              { opacity: pressed ? 0.6 : 1 },
              styles.segmentItem,
              isActive ? styles.segmentItemActive : undefined,
            ]}
            onPress={() => onChangeTab(tab)}
          >
            <ThemedText
              type='smallBold'
              style={[
                styles.segmentLabel,
                isActive ? styles.segmentLabelActive : undefined,
              ]}
              selectable={false}
            >
              {tab === 'contacts' ? 'Contacts' : 'People who added you'}
            </ThemedText>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}
