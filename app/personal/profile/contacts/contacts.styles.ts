import { StyleSheet } from 'react-native-unistyles';

const styles = StyleSheet.create((theme, rt) => ({
  mainContainer: {
    flex: 1,
    paddingTop: rt.insets.top,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  listContent: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 8,
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: theme.colors.title,
    marginBottom: 4,
  },
  headerSubtitle: {
    color: theme.colors.text,
    fontSize: 14,
    paddingLeft: 1,
    opacity: 0.8,
  },
  pendingPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.neutral2,
    borderTopRightRadius: 30,
    borderTopLeftRadius: 20,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginBottom: 4,
  },
  pendingPillText: {
    color: theme.colors.whiteOrBlack,
  },
  pendingPillTextPrimary: {
    color: theme.colors.primary,
  },
  pendingPillTextWarning: {
    color: theme.colors.yellow,
  },
  addButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 36,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.BackgroundSelect,
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
  segmentLabel: {
    color: theme.colors.text,
    opacity: 0.8,
  },
  segmentLabelActive: {
    color: theme.colors.title,
    opacity: 1,
  },
  segmentCount: {
    color: theme.colors.text,
    opacity: 0.7,
  },
  segmentCountActive: {
    color: theme.colors.primary,
    opacity: 1,
  },
  listRow: {
    gap: 12,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.neutral2,
    borderTopRightRadius: 30,
    borderTopLeftRadius: 20,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 20,
    padding: 8,
    paddingLeft: 10,
    paddingVertical: 2,
    paddingRight: 25,
  },
  addButtonPressed: {
    opacity: 0.7,
  },
  addButtonLabel: {
    color: theme.colors.whiteOrBlack,
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
    // Use semibold type sizing from ThemedText + tighter lineHeight like Postcard
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
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.neutral0,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.neutral,
    marginVertical: 12,
  },
  // Outer combined container for the add-contact username inputs
  usernameInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 'auto',
    borderWidth: 1,
    borderColor: theme.colors.neutral,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    paddingHorizontal: 8,
    gap: 0,
  },
  // Letters part: 4 characters
  usernameLettersInput: {
    width: 70, // ~4 chars
    paddingHorizontal: 0,
    marginRight: 3,
    letterSpacing: 1,
    height: 40,
    textAlign: 'right',
    color: theme.colors.text,
  },
  // Numbers part: 6 digits
  usernameNumbersInput: {
    width: 300,
    paddingHorizontal: 0,
    letterSpacing: 1,
    height: 40,
    color: theme.colors.primary,
  },
  // Legacy single input (kept for safety but not used by the new flow)
  addInput: {
    borderWidth: 1,
    borderColor: theme.colors.neutral,
    paddingHorizontal: 16,
    // paddingVertical: 10,
    height: 40,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    color: theme.colors.text,
  },
  inputError: {
    color: theme.colors.orange,
    marginTop: 4,
  },
  profileHint: {
    opacity: 0.7,
  },
  actionRow: {
    width: '100%',
    alignItems: 'flex-end',
  },
  actionButton: {
    backgroundColor: theme.colors.icon,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPressed: {
    opacity: 0.1,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: theme.colors.blackOrWhite,
    fontWeight: 'bold',
  },
  errorText: {
    color: theme.colors.orange,
    marginBottom: 12,
  },
}));

export default styles;
export type ContactsStyles = typeof styles;
