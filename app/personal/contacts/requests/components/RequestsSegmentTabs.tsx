import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { Pressable } from 'react-native';
import styles from '../requests.styles';

export type RequestsSegmentTabsProps = {
  selectedTab: 'pending' | 'sent';
  onChangeTab: (tab: 'pending' | 'sent') => void;
};

export default function RequestsSegmentTabs({
  selectedTab,
  onChangeTab,
}: RequestsSegmentTabsProps) {
  return (
    <ThemedView style={styles.segmentContainer}>
      {(['pending', 'sent'] as const).map((tab) => {
        const isActive = selectedTab === tab;
        return (
          <Pressable
            key={tab}
            style={({ pressed }) => [
              { opacity: pressed ? 0.1 : 1 },
              styles.segmentItem,
              isActive ? styles.segmentItemActive : undefined,
            ]}
            onPress={() => onChangeTab(tab)}
          >
            <ThemedText type='smallBold' selectable={false}>
              {tab === 'pending' ? 'Pending' : 'Sent'}
            </ThemedText>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}
