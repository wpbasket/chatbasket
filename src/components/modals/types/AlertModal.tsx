// components/modals/types/AlertModal.tsx
import React from 'react';
import { Pressable, View } from 'react-native';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { StyleSheet } from 'react-native-unistyles';

interface AlertModalProps {
  message: string;
  title?: string;
  buttonText?: string;
  onClose?: () => void;
}

export function AlertModal({
  message,
  title,
  buttonText = 'OK',
  onClose,
}: AlertModalProps) {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        {title && <ThemedText style={styles.title}>{title}</ThemedText>}
        <ThemedText style={styles.message}>{message}</ThemedText>
      </View>
      
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [
          styles.button,
          { opacity: pressed ? 0.1 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={buttonText}
      >
        <ThemedText style={styles.buttonText}>{buttonText}</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create((theme,rt) => ({
  container: {
    // backgroundColor: theme.colors.BackgroundSelect,
    borderRadius: 12,
    paddingVertical:10,
    overflow: 'hidden',
    // borderColor: theme.colors.neutral,
    // borderWidth: 1,
    ...(rt.themeName=='dark' ? {
      backgroundColor:'rgba(13,13,13,0.9)',
      boxShadow: '0px 10px 15px rgba(15,15,15,0.2)',
      borderColor: theme.colors.neutral4,
      borderWidth: 1,
      } : {
        backgroundColor: theme.colors.BackgroundSelect,
        // boxShadow: '0px 10px 15px rgba(0,0,0,0.2)',
        boxShadow: '0px 0px 100px rgba(0, 187,119, 0.1)',
        borderColor: {
          xs: theme.colors.neutral,
          sm: theme.colors.neutral,
          md: theme.colors.neutral,
          lg: theme.colors.neutral2
        },
        borderWidth: 1,
      }),
    width:300
  },
  content: {
    padding: 15,
    paddingTop:10,
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: theme.colors.text,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 22,
    // textAlign: 'center',
    color: theme.colors.text,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    // alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
}));