// components/ui/Dropdown.tsx
import React from 'react';
import { Pressable, ViewStyle, TextStyle } from 'react-native';
import { ThemedText } from './ThemedText';
import { StyleSheet } from 'react-native-unistyles';
import { modalActions, modal$ } from '@/state/modals/modals.state';
import { useObservable, useObserve, use$ } from '@legendapp/state/react';
import type { DropdownPickerItem } from '@/components/modals/types/modal.types';

interface DropdownProps<T = any> {
  value?: T;
  placeholder?: string;
  options: DropdownPickerItem<T>[];
  onSelect: (value: T) => void;
  style?: ViewStyle;
  error?: boolean;
  disabled?: boolean;
  
  // Modal options
  title?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  cancelText?: string;
  
  // Container styling
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  placeholderStyle?: TextStyle;
  arrowStyle?: TextStyle;
  
  // Modal styling grouped
  modalStyles?: {
    container?: ViewStyle;
    header?: ViewStyle;
    title?: TextStyle;
    searchContainer?: ViewStyle;
    searchInput?: TextStyle;
    item?: ViewStyle;
    selectedItem?: ViewStyle;
    disabledItem?: ViewStyle;
    itemLabel?: TextStyle;
    selectedItemLabel?: TextStyle;
    disabledItemLabel?: TextStyle;
    itemSubtitle?: TextStyle;
    checkmark?: TextStyle;
    footer?: ViewStyle;
    cancelButton?: ViewStyle;
    cancelButtonText?: TextStyle;
    emptyContainer?: ViewStyle;
    emptyText?: TextStyle;
  };
}

export function Dropdown<T = any>({ 
  value, 
  placeholder = 'Select option',
  options, 
  onSelect, 
  style,
  error,
  disabled,
  title,
  searchable,
  searchPlaceholder,
  emptyMessage,
  cancelText,
  containerStyle,
  textStyle,
  placeholderStyle,
  arrowStyle,
  modalStyles,
}: DropdownProps<T>) {
  
  const dropdownState$ = useObservable(() => ({
    id: `dropdown-${Math.random().toString(36).substr(2, 9)}`,
    isModalOpen: false
  }));
  
  // React Compiler will optimize this lookup
  const selectedOption = options.find(opt => opt.value === value);
  const displayText = selectedOption?.label || placeholder;
  const isPlaceholder = !selectedOption;
  
  // Track modal state for this specific dropdown using Legend State
  useObserve(() => {
    const modalState = modal$.get();
    const isThisDropdownOpen = modalState.isVisible && 
      modalState.type === 'dropdown-picker' && 
      modalState.id === dropdownState$.id.get();
    dropdownState$.isModalOpen.set(isThisDropdownOpen);
  });
  
  const handlePress = (event: any) => {
    if (disabled) return;
    
    if (!options || options.length === 0) {
      console.warn('Dropdown: No options provided');
      return;
    }
    
    // Capture the touch/click position
    const position = {
      x: event.nativeEvent.pageX || event.nativeEvent.locationX || 0,
      y: event.nativeEvent.pageY || event.nativeEvent.locationY || 0,
    };
    
    const id = dropdownState$.id.get();
    modalActions.dropdownPicker({
      title,
      items: options,
      selectedValue: value,
      searchable,
      searchPlaceholder,
      emptyMessage,
      cancelText,
      onSelect,
      modalStyles,
    }, position, id);
  };

  return (
    <Pressable 
      onPress={handlePress}
      style={({pressed}) => [
        styles.container, 
        containerStyle,
        error && styles.error, 
        disabled && styles.disabled,
        { opacity: pressed ? 0.1 : 1 },
        style
      ]}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title || 'Dropdown'}: ${displayText}`}
      accessibilityHint="Tap to select an option"
      accessibilityState={{ disabled }}
    >
      <ThemedText 
        style={[
          styles.text, 
          textStyle,
          isPlaceholder && [styles.placeholder, placeholderStyle]
        ]}
        type='defaultGantari'
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {displayText}
      </ThemedText>
      <ThemedText style={[
        styles.arrow, 
        arrowStyle,
        use$(dropdownState$.isModalOpen) && { transform: [{ rotate: '-90deg' }] }
      ]}>
        ◀
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    height: 40,
    width: 350,
    borderColor: theme.colors.neutral2,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background,
  },
  error: {
    borderColor: theme.colors.red,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    color: theme.colors.orange,
    fontSize: 16,
    // fontWeight:'bold',
    flex: 1,
  },
  placeholder: {
    color: 'gray',
  },
  arrow: {
    color: 'gray',
    fontSize: 12,
  },
}));