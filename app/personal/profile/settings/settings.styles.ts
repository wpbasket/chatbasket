import { StyleSheet } from 'react-native-unistyles';

const styles = StyleSheet.create((theme, rt) => ({
  mainContainer: {
    flex: 1,
    paddingTop: rt.insets.top,
    gap: 20,
  },
  container: {
    flex: 1,
    gap: 20,
    paddingHorizontal: 20,
    // backgroundColor: theme.colors.yellow,
  },
  flex1: {
    flex: 1,
    gap: 15,
  },
  section: {
    flexDirection: 'row',
    // backgroundColor:'red',
    width: 367,
    justifyContent: 'space-between',
  },
  sectionHeader: {
    fontSize: 18,
    marginBottom: -5,
    color: theme.colors.primary,
  },
  itemTitleContainer: {
    // flex: 1,
    width: 100,
    // backgroundColor: 'yellow'
  },
  itemTitle: {
    fontSize: 15,
    color: theme.colors.whiteOrBlack,
    // fontWeight: 'bold',
  },
  itemContainer: {
    width: 241,
    paddingRight: 10,
    // backgroundColor: 'pink',
  },
  item: {
    fontSize: 15,
  },
  changeContainer: {
    width: 30,
    height: 25,
    gap: 2,
    alignItems: 'center',
    // flexDirection: 'row',
    // backgroundColor: 'blue'
  },
  themePickerContainer: {
    width: 217,
    height: 30,
    borderColor: theme.colors.neutral5,
    borderWidth: 1,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    justifyContent: 'center',
  },
  dropdownBorder: {
    height: 27,
    width: 215,
    borderWidth: 0,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 8,
    borderTopRightRadius: 25,
    paddingHorizontal: 16,
  },
  primaryText: {
    color: theme.colors.primary,
  },
  modalInput: {
    height: 40,
    fontSize: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.colors.neutral4,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 8,
    borderTopRightRadius: 25,
    color: theme.colors.whiteOrBlack,
  },
  inputError: {
    borderColor: 'red',
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  modalActionButton: {
    backgroundColor: theme.colors.icon,
    height: 60,
    width: 60,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionText: {
    color: theme.colors.blackOrWhite,
    fontWeight: 'bold',
  },
  actionRightRow: {
    width: '100%',
    alignItems: 'flex-end',
  },
  modalPillButton: {
    backgroundColor: theme.colors.icon,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export default styles;
export type SettingsStyles = typeof styles;
