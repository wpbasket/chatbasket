import { StyleSheet } from 'react-native-unistyles';

const styles = StyleSheet.create((theme, rt) => ({
  mainContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  listContent: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  errorText: {
    color: theme.colors.orange,
    marginBottom: 12,
  },
  headerSummary: {
    marginBottom: 16,
    minHeight: 18,
  },
  headerSummaryText: {
    color: theme.colors.whiteOrBlack,
    fontSize: 14,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.neutral0,
    borderRadius: 999,
    padding: 4,
    gap: 8,
    marginBottom: 16,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
  },
  segmentItemActive: {
    backgroundColor: theme.colors.neutral0,
  },
  segmentItemPressed: {
    opacity: 0.7,
  },
  listRow: {
    gap: 12,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rowContent: {
    flex: 1,
    gap: 0,
  },
  rowName: {
    // Use semibold type sizing from ThemedText (same as Postcard)
    lineHeight: 16,
    color: theme.colors.title,
  },
  rowUsername: {
    // Do not reduce opacity so colors from usernameLetters/usernameNumbers match profile
    opacity: 1,
  },
  usernameLetters: {
    color: theme.colors.title,
  },
  usernameNumbers: {
    color: theme.colors.primary,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  rowBio: {
    opacity: 0.75,
  },
  meta: {
    fontSize: 11,
    opacity: 0.7,
  },
  pendingActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.neutral2,
    borderTopRightRadius: 30,
    borderTopLeftRadius: 20,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pendingActionButtonPressed: {
    opacity: 0.7,
  },
  pendingActionButtonLabelPrimary: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  pendingActionButtonLabelDanger: {
    color: theme.colors.orange,
    fontSize: 12,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.neutral,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 6,
    backgroundColor: theme.colors.neutral0,
  },
  badgeDeclined: {
    backgroundColor: theme.colors.orange,
  },
  badgeAccepted: {
    backgroundColor: theme.colors.green,
  },
  badgeText: {
    color: theme.colors.white,
    fontWeight: '600',
  },
}));

export default styles;
export type RequestsStyles = typeof styles;
