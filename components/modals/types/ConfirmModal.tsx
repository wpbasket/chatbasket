// components/modals/types/ConfirmModal.tsx
import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { StyleSheet } from 'react-native-unistyles';
import type { ConfirmModalProps } from '@/components/modals/types/modal.types';
import { pressableAnimation } from '@/hooks/pressableAnimation';

export function ConfirmModal({
  message,
  onConfirm,
  onClose,
  confirmText = '',
  cancelText = '',
  confirmVariant = 'default',
  cancelVariant = 'default',
}: ConfirmModalProps) {
  const handleConfirm = () => {
    onConfirm?.();
    onClose?.();
  };

  const handleCancel = () => {
    onClose?.();
  };

  const { handlePressIn } = pressableAnimation();

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText style={styles.message} selectable={false}>{message}</ThemedText>
      </View>

      <View style={styles.buttonContainer}>
        <Pressable
          onPress={handleCancel}
          onPressIn={handlePressIn}
          style={({ pressed }) => [
            styles.button,
            cancelVariant === 'destructive' ? styles.destructiveButton : styles.cancelButton,
            { opacity: pressed ? 0.1 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={cancelText}
        >
          <ThemedText
            style={cancelVariant === 'destructive' ? styles.destructiveText : styles.cancelText} selectable={false}
          >
            {cancelText}
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={handleConfirm}
          onPressIn={handlePressIn}
          style={({ pressed }) => [
            styles.button,
            confirmVariant === 'destructive' ? styles.destructiveButton : styles.confirmButton,
            { opacity: pressed ? 0.1 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={confirmText}
        >
          <ThemedText
            style={confirmVariant === 'destructive' ? styles.destructiveText : styles.confirmText}
            selectable={false}
          >
            {confirmText}
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create((theme,rt) => ({
  container: {
    // backgroundColor: theme.colors.BackgroundSelect,
    borderRadius: 12,
    overflow: 'hidden',
    // borderColor: theme.colors.neutral3,
    // borderWidth: 1,
    ...(rt.themeName == 'dark' ? {
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
    padding: 20,
    paddingBottom: 16,
  },
  message: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    color: theme.colors.text,
  },
  buttonContainer: {
    flexDirection: 'row',
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
  },
  confirmButton: {
  },
  destructiveButton: {
  },
  cancelText: {
    color: theme.colors.subtitle,
    fontSize: 16,
    fontWeight: '500',
  },
  confirmText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  destructiveText: {
    color: theme.colors.red,
    fontSize: 16,
    fontWeight: '600',
  },
}));