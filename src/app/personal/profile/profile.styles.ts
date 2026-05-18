import { StyleSheet } from 'react-native-unistyles';

const styles = StyleSheet.create((theme, rt) => ({
  mainContainer: {
    flex: 1,
    paddingTop: 10
  },

  // ─── Update Profile Button ───────────────────────────────
  outerEditIcon: {
    marginBottom: 20,
    paddingLeft: 30,
  },
  editIcon: {
    alignSelf: 'flex-start',
  },

  // ─── Profile Info Section (Avatar + User Info) ───────────
  profileInfoSection: {
    flexDirection: 'row',
    paddingHorizontal: 30,
    gap: 20,
    alignItems: 'flex-start',
  },
  profilePicture: {
    // Styling controlled by ProfileAvatar component
  },
  userInfoContainer: {
    flex: 1,
    paddingTop: 20,
    paddingRight: 15,
  },
  usernameContainer: {
    flexDirection: 'row',
    marginTop: 8,
  },
  usernameStrings: {
    color: theme.colors.title,
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  usernameNumbers: {
    color: theme.colors.primary,
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  avatarColumn: {
    alignItems: 'flex-start',
    gap: 0,
  },
  profileTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  profileTypeBadgeText: {
    color: theme.colors.icon,
    fontSize: 13,
    fontWeight: '500',
  },
  bioText: {
    fontSize: 13,
    color: theme.colors.icon,
    marginTop: 6,
    lineHeight: 18,
  },

  // ─── Menu Section (Personal, Settings, Logout) ──────────
  menuSection: {
    paddingHorizontal: 30,
    paddingTop: 48,
    gap: 10,
  },
  bucketColor: {
    color: theme.colors.primary,
  },
  bucketText: {
    color: theme.colors.whiteOrBlack,
  },
  menuItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingVertical: 2,
  },
  menuItemIcon: {
    width: 20,
    alignItems: 'center',
  },

  // ─── Empty State ─────────────────────────────────────────
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyContent: {
    alignItems: 'center',
    gap: 20,
    maxWidth: 300,
  },
  emptyDescription: {
    textAlign: 'center',
    opacity: 0.7,
    fontSize: 16,
  },
  createProfileButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 10,
  },
  createProfileButtonText: {
    color: theme.colors.lightbackgroundText,
    fontWeight: 'bold',
    fontSize: 16,
  },
}));

export default styles;
export type ProfileStyles = typeof styles;
