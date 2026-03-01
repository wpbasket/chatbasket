import { ThemedText } from '@/components/ui/common/ThemedText';
import type { TextStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export type UsernameDisplayProps = {
  username?: string | null;
  lettersStyle?: TextStyle;
  numbersStyle?: TextStyle;
};

const splitUsername = (username?: string | null): { letters: string; numbers: string } => {
  if (!username) return { letters: 'HIDDEN', numbers: '' };
  if (username.length <= 4) {
    return { letters: username.toUpperCase(), numbers: '' };
  }
  return {
    letters: username.slice(0, 4).toUpperCase(),
    numbers: username.slice(4),
  };
};

export function UsernameDisplay({ username, lettersStyle, numbersStyle }: UsernameDisplayProps) {
  const parts = splitUsername(username ?? undefined);

  return (
    <ThemedText type='astaSansWithoutColorAndSize'>
      <ThemedText
        type='astaSansWithoutColorAndSize'
        style={[numbersStyle, styles.atSymbol]}
      >
        @
      </ThemedText>
      <ThemedText
        type='astaSansWithoutColorAndSize'
        style={lettersStyle}
      >
        {parts.letters}
      </ThemedText>
      {parts.numbers ? (
        <ThemedText
          type='astaSansWithoutColorAndSize'
          style={numbersStyle}
        >
          {parts.numbers}
        </ThemedText>
      ) : null}
    </ThemedText>
  );
}

const styles = StyleSheet.create((theme) => ({
  atSymbol: {
    color: theme.colors.icon,
  },
}));
