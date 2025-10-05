import { View, type ViewProps } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({ style, lightColor, darkColor, ...otherProps }: ThemedViewProps) {
  // Use theme-aware background color
  return <View style={[styles.container, style]} {...otherProps} />;
}

const styles = StyleSheet.create(theme => ({
  container: {
    backgroundColor: theme.colors.background,
  },
}));
