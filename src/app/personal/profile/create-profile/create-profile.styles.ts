import { Platform } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

const styles = StyleSheet.create((theme, rt) => ({
  mainContainer: {
    flex: 1,
  },
  container: {
    height: 500,
    padding: 20,
    borderRadius: 20,
    maxWidth: 600,
    backgroundColor:
      Platform.OS === 'web'
        ? theme.colors.BackgroundSelect2
        : theme.colors.background,
    gap: 20,
  },
  input: {
    height: 40,
    width: 350,
    borderColor: theme.colors.neutral5,
    borderWidth: 1,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    paddingHorizontal: 16,
    color: theme.colors.text,
  },
  inputError: {
    borderColor: theme.colors.red,
  },
  submit: {
    height: 70,
    width: 70,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 9999,
    backgroundColor: theme.colors.primary,
  },
  submitText: {
    color: theme.colors.lightbackgroundText,
    fontWeight: 'bold',
    fontSize: 16,
  },
  bio: {
    height: 100,
    width: 350,
    borderWidth: 1,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    borderColor: theme.colors.neutral5,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: theme.colors.text,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 350,
    height: 40,
    borderWidth: 1,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    paddingHorizontal: 16,
    borderColor: theme.colors.neutral5,
  },
  inputField: {
    flex: 1,
    height: '100%',
    color: theme.colors.text,
    paddingRight: 10,
  },
  inputButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileVisibleToContainer: {
    width: 350,
    height: 40,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    borderColor: theme.colors.neutral5,
    borderWidth: 1,
  },
  reverseModalBackground: {
    height: 38,
    width: 340,
    borderWidth: 0,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 8,
    borderTopRightRadius: 25,
    paddingHorizontal: 16,
  },
}));

export default styles;
export type CreateProfileStyles = typeof styles;
