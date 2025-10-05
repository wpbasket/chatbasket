// components/modals/AppModal.tsx
import { modalActions, modals$ } from '@/state/modals/modals.state';
import { use$ } from '@legendapp/state/react';
import React, { useState } from 'react';
import { LayoutChangeEvent, Modal, Platform, Pressable, useWindowDimensions, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { AlertModal } from './types/AlertModal';
import { ConfirmModal } from './types/ConfirmModal';
import { ControllersModal } from './types/ControllersModal';
import { DropdownPickerModal } from './types/DropdownPickerModal';
import { LoadingModal } from './types/LoadingModal';

export function AppModal() {
  // Full stack of modals; last item is top-most
  const stack = use$(modals$);
  const isAnyVisible = stack.length > 0;

  // Track measured content size per modal for accurate positioning
  const [contentSizes, setContentSizes] = useState<Record<string, { width: number; height: number }>>({});
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const onContentLayout = (key: string) => (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContentSizes((prev) => {
      const existing = prev[key];
      if (existing && existing.width === width && existing.height === height) return prev;
      return { ...prev, [key]: { width, height } };
    });
  };

  const getModalPosition = (position: { x: number; y: number } | null | undefined, key: string): { overlay: ViewStyle; content: ViewStyle } => {
    const isWide = screenWidth > 1860;

    if (!position) {
      // Default to centered modal; only apply LR padding on wide screens
      return {
        overlay: {
          justifyContent: 'center' as const,
          alignItems: 'center' as const,
          ...(isWide ? { paddingLeft: 270, paddingRight: 520 } : { paddingLeft: 20, paddingRight: 20 }),
        },
        content: {},
      };
    }

    // Positioned modal near a point. Clamp using measured content size if available.
    const pressOffset = 10; // small gap from finger/cursor

    // Safe area margins
    const statusBarHeight = Platform.OS === 'ios' ? 44 : 24;
    const marginTop = Math.max(statusBarHeight + 8, 12);
    const marginBottom = 16;
    const marginLR = 12;

    // Effective horizontal margins considering wide layouts
    const leftPadding = isWide ? 270 : 20;
    const rightPadding = isWide ? 520 : 20;
    const minLeft = leftPadding + marginLR;
    const maxRight = rightPadding + marginLR; // used to keep space from right edge when measuring width

    let top: number;
    let left: number;

    const contentSize = contentSizes[key];
    if (contentSize) {
      // Prefer showing below the press; if not enough space, flip above
      const spaceBelow = screenHeight - position.y - marginBottom;
      const showBelow = spaceBelow >= contentSize.height + pressOffset;
      const desiredTop = showBelow ? position.y + pressOffset : position.y - pressOffset - contentSize.height;
      top = Math.min(
        Math.max(desiredTop, marginTop),
        screenHeight - marginBottom - contentSize.height,
      );

      // Horizontal: anchor near press.x, shift to keep within screen
      const desiredLeft = position.x;
      const maxLeftAllowed = screenWidth - maxRight - contentSize.width;
      left = Math.min(
        Math.max(desiredLeft, minLeft),
        Math.max(minLeft, maxLeftAllowed),
      );
    } else {
      // Fallback before measurement: place near press and roughly clamp
      top = Math.max(position.y + pressOffset, marginTop);
      if (top > screenHeight - 50) top = screenHeight - 50;

      left = Math.max(position.x, leftPadding + marginLR);
      if (left > screenWidth - rightPadding - marginLR) {
        left = screenWidth - rightPadding - marginLR;
      }
    }

    return {
      overlay: {
        justifyContent: 'flex-start' as const,
        alignItems: 'flex-start' as const,
        ...(isWide ? { paddingLeft: 270, paddingRight: 520 } : { paddingLeft: 20, paddingRight: 20 }),
      },
      content: {
        position: 'absolute' as const,
        top,
        left,
      },
    };
  };

  const renderModalContent = (entry: { type: string; props: any }, closeThis: () => void) => {
    const { type, props } = entry;
    // Do not call props.onClose here; modalActions.close/closeById will invoke it.
    const handleOnClose = closeThis;
    switch (type) {
      case 'confirm':
        return (
          <ConfirmModal
            message={props.message}
            onConfirm={props.onConfirm}
            onClose={handleOnClose}
            confirmText={props.confirmText}
            cancelText={props.cancelText}
            confirmVariant={props.confirmVariant}
            cancelVariant={props.cancelVariant}
          />
        );
      case 'alert':
        return (
          <AlertModal
            message={props.message}
            title={props.title}
            buttonText={props.buttonText}
            onClose={handleOnClose}
          />
        );
      case 'dropdown-picker':
        return (
          <DropdownPickerModal
            title={props.title}
            items={props.items || []}
            selectedValue={props.selectedValue}
            onSelect={props.onSelect}
            onClose={handleOnClose}
            placeholder={props.placeholder}
            searchable={props.searchable}
            searchPlaceholder={props.searchPlaceholder}
            emptyMessage={props.emptyMessage}
            cancelText={props.cancelText}
            modalStyles={props.modalStyles}
          />
        );
      case 'controllers':
        return (
          <ControllersModal
            title={props.title}
            message={props.message}
            controllers={props.controllers || []}
            confirmText={props.confirmText}
            cancelText={props.cancelText}
            showConfirmButton={props.showConfirmButton}
            showCancelButton={props.showCancelButton}
            closeOnControllerPress={props.closeOnControllerPress}
            onConfirm={props.onConfirm}
            confirmDisabled={props.confirmDisabled} 
            onCancel={props.onCancel}
            onClose={handleOnClose}
          />
        );
      case 'loading':
        return (
          <LoadingModal
            title={props.title}
            message={props.message}
            cancellable={props.cancellable}
            onCancel={props.onCancel}
            closeOnBackgroundTap={props.closeOnBackgroundTap}
            onClose={handleOnClose}
          />
        );
      default:
        return null;
    }
  };


  if (!isAnyVisible) {
    return null;
  }

  // Render all modals in the stack in order; last rendered is on top
  return (
    <>
      {stack.map((entry, idx) => {
        const key = entry.id ?? `modal-${idx}`;
        const overlayStyle = getModalPosition(entry.position, key);
        const closeThis = () => {
          if (entry.id) modalActions.closeById(entry.id);
          else if (idx === stack.length - 1) modalActions.close();
        };
        const props = entry.props || {};
        return (
          <Modal
            key={key}
            transparent
            animationType='none'
            visible={true}
            onRequestClose={closeThis}
            statusBarTranslucent
            hardwareAccelerated
          >
            <Pressable
              style={[styles.overlay, overlayStyle.overlay]}
              onPress={props?.closeOnBackgroundTap === false ? undefined : closeThis}
            >
              <Pressable
                style={[styles.content, overlayStyle.content]}
                onPress={(e) => e.stopPropagation()}
                onLayout={onContentLayout(key)}
              >
                {renderModalContent({ type: entry.type, props }, closeThis)}
              </Pressable>
            </Pressable>
          </Modal>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  overlay: {
    flex: 1,
    // backgroundColor: 'rgba(0, 0, 0, 0.5)', // Semi-transparent backgroundz
  },
  content: {
    // Let modal types decide their own sizing
    padding: 0,
    elevation: 8,
  },
}));