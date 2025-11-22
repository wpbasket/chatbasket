import { StyleSheet } from 'react-native-unistyles';

const styles = StyleSheet.create((theme, rt) => ({
  mainContainer: {
    flex: 1,
    paddingTop: rt.insets.top,
  },
  container: {
    height: 290,
    width: '100%',
    flexDirection: 'row',
    padding: 20,
    // backgroundColor:'white',
    paddingLeft: 30,
    paddingTop: 0,
    gap: 20,
  },
  profilePictureContainer: {
    // height: 290,
    width: 80,
    gap: 20,
  },
  profilePicture: {
    height: 80,
    width: 80,
    backgroundColor: theme.colors.icon,
    borderRadius: 9999,
  },
  profilePictureImage: {
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    borderRadius: 9999,
  },
  outerBucketContainer: {
    gap: 10,
  },
  bucketContainer: {
    flexDirection: 'row',
    width: 70,
    gap: 10,
    alignItems: 'center',
  },
  bucketColor: {
    color: theme.colors.primary,
  },
  bucketText: {
    color: theme.colors.whiteOrBlack,
  },
  userInfoContainer: {
    width: '72%',
    paddingTop: 20,
    gap: 3,
    paddingBottom: 20,
    paddingRight: 15,
  },
  usernameContainer: {
    flexDirection: 'row',
  },
  usernameStrings: {
    color: theme.colors.title,
  },
  usernameNumbers: {
    color: theme.colors.primary,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  bio: {
    fontSize: 13,
  },
  outerEditIcon: {
    marginBottom: 20,
    paddingLeft: 25,
  },
  editIcon: {
    width: 125,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  // Empty State Styles
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
