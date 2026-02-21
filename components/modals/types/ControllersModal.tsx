// components/modals/types/ControllersModal.tsx
import type { ControllersModalProps, ControllerSpec } from '@/components/modals/types/modal.types';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export function ControllersModal({
  title,
  message,
  controllers,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  showConfirmButton = true,
  showCancelButton = true,
  closeOnControllerPress = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  onClose,
}: ControllersModalProps) {
  const { handlePressIn } = pressableAnimation();

  const handleControllerPress = async (ctrl: ControllerSpec) => {
    try {
      await ctrl.onPress?.();
    } finally {
      if (closeOnControllerPress) {
        onClose?.();
      }
    }
  };

  const handleConfirm = async () => {
    // Don't proceed if confirm is disabled
    if (confirmDisabled) return;

    await onConfirm?.();
    onClose?.();
  };

  const handleCancel = async () => {
    await onCancel?.();
    onClose?.();
  };

  return (
    <ThemedView style={styles.container}>
      {(title || message) && (
        <View style={styles.header}>
          {title ? (
            <ThemedText type='defaultGantari' style={styles.title} selectable={false}>{title}</ThemedText>
          ) : null}
          {message ? (
            <ThemedText style={styles.message} selectable={false}>{message}</ThemedText>
          ) : null}
        </View>
      )}

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        {controllers.map((ctrl) => {
          // If custom content is provided, render it directly in a container
          if (ctrl.content) {
            return (
              <View key={ctrl.id} style={styles.controllerContent} pointerEvents={ctrl.disabled ? 'none' : 'auto'}>
                <View style={styles.controllerRow}>
                  <View style={styles.contentWrapper}>
                    {ctrl.content}
                  </View>
                  {ctrl.label && (
                    <ThemedText style={styles.controllerLabel} selectable={false}>
                      {ctrl.label}
                    </ThemedText>
                  )}
                </View>
              </View>
            );
          }

          // Default: render as a pressable button row
          return (
            <Pressable
              key={ctrl.id}
              disabled={ctrl.disabled}
              onPress={() => handleControllerPress(ctrl)}
              onPressIn={handlePressIn}
              style={({ pressed }) => [
                styles.controller,
                ctrl.disabled && styles.controllerDisabled,
                { opacity: pressed ? 0.1 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={ctrl.label}
            >
              {ctrl.label ? (
                <ThemedText style={styles.controllerText} selectable={false}>
                  {ctrl.label}
                </ThemedText>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {(showCancelButton || showConfirmButton) && (
        <View style={styles.footer}>
          <View style={styles.footerSlot}>
            {showCancelButton ? (
              <View style={styles.footerBtn}>
                <Pressable
                  onPress={handleCancel}
                  onPressIn={handlePressIn}
                  style={({ pressed }) => [{ opacity: pressed ? 0.1 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={cancelText}
                  hitSlop={4}
                >
                  <ThemedText type='defaultGantari' style={styles.cancelText} selectable={false}>
                    {cancelText}
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
          </View>
          <View style={styles.footerSlot}>
            {showConfirmButton ? (
              <View style={styles.footerBtn}>
                <Pressable
                  disabled={confirmDisabled}
                  onPress={handleConfirm}
                  onPressIn={handlePressIn}
                  style={({ pressed }) => [
                    { opacity: pressed && !confirmDisabled ? 0.1 : 1 }
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={confirmText}
                  hitSlop={4}
                >
                  <ThemedText
                    type='defaultGantari'
                    style={[
                      styles.confirmText,
                      confirmDisabled && styles.confirmTextDisabled
                    ]}
                    selectable={false}
                  >
                    {confirmText}
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    // backgroundColor: theme.colors.BackgroundSelect,
    borderRadius: 12,
    overflow: 'hidden',

    ...(rt.themeName == 'dark' ? {
      backgroundColor: 'rgba(13,13,13,0.9)',
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
    // height:'100%'
    // maxHeight: 300,
    width: {
      xs: 300,
      sm: 300,
      md: 300,
      lg: 400
    }

  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 16,
    // fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.subtitle,
    textAlign: 'center',
  },
  list: {
    maxHeight: 260,
  },
  listContent: {
    paddingVertical: 6,
  },
  controller: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    // borderTopColor: theme.colors.neutral2,
    // borderTopWidth: 1,
  },
  controllerDisabled: {
    opacity: 0.5,
  },
  controllerText: {
    color: theme.colors.whiteOrBlack,
    fontSize: 15,
  },
  controllerContent: {
    padding: 12,
    width: '100%',
  },
  controllerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  contentWrapper: {
    flex: 1,
    marginRight: 8,
  },
  controllerLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginLeft: 8,
  },
  footer: {
    flexDirection: 'row',
    // borderTopColor: theme.colors.neutral1,
    // borderTopWidth: 1,
  },
  footerSlot: {
    flex: 1,
  },
  footerBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: theme.colors.red,
    fontSize: 16,
    fontWeight: '600',
  },
  confirmText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  confirmTextDisabled: {
    opacity: 0.3,
  },
}));