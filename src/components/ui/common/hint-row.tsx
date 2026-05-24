import type { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { UnistylesRuntime } from 'react-native-unistyles';

import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

import { Colors } from '@/constants/Colors';
import { Spacing } from '@/constants/theme';

type HintRowProps = {
  title?: string;
  hint?: ReactNode;
};

export function HintRow({ title = 'Try editing', hint = 'app/index.tsx' }: HintRowProps) {
  const themeName = UnistylesRuntime.themeName as 'light' | 'dark';
  const activeColors = Colors[themeName];

  return (
    <View style={styles.stepRow}>
      <ThemedText type="small">{title}</ThemedText>
      <ThemedView style={[styles.codeSnippet, { backgroundColor: activeColors.backgroundSelected }]}>
        <ThemedText color={activeColors.textSecondary}>{hint}</ThemedText>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  codeSnippet: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
});
