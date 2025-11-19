import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { styles } from '../requests.styles';

export type RequestsHeaderSummaryProps = {
  pendingCount: number;
  sentCount: number;
  error: string | null | undefined;
  lastFetchedAt: any;
};

export function RequestsHeaderSummary({
  pendingCount,
  sentCount,
  error,
  lastFetchedAt,
}: RequestsHeaderSummaryProps) {
  return (
    <ThemedView style={styles.headerSummary}>
      {lastFetchedAt != null && !error ? (
        pendingCount === 0 && sentCount === 0 ? (
          <ThemedText
            type='small'
            style={styles.headerSummaryText}
            selectable={false}
          >
            {"You don't have any contact requests yet."}
          </ThemedText>
        ) : (
          <>
            <ThemedText
              type='small'
              style={styles.headerSummaryText}
              selectable={false}
            >
              {`Pending: ${pendingCount}`}
            </ThemedText>
            <ThemedText
              type='small'
              style={styles.headerSummaryText}
              selectable={false}
            >
              {`Sent: ${sentCount}`}
            </ThemedText>
          </>
        )
      ) : null}
    </ThemedView>
  );
}
