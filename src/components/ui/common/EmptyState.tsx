import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { StyleSheet } from 'react-native-unistyles';

interface EmptyStateProps {
  title?: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <ThemedView style={styles.container}>
      {title ? (
        <ThemedText type='subtitle' selectable={false}>
          {title}
        </ThemedText>
      ) : null}
      {description ? (
        <ThemedText style={styles.description} selectable={false}>
          {description}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignItems: 'flex-start',
    gap: 8,
  },
  description: {
    opacity: 0.75,
    fontSize: 15,
  },
}));
