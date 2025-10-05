// components/modals/types/DropdownPickerModal.tsx
import React, { useState } from 'react';
import {
  Pressable,
  View,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { StyleSheet } from 'react-native-unistyles';
import type { DropdownPickerModalProps, DropdownPickerItem } from '@/components/modals/types/modal.types';
import { pressableAnimation } from '@/hooks/pressableAnimation';

export function DropdownPickerModal<T = any>({
  title,
  items,
  selectedValue,
  onSelect,
  onClose,
  placeholder = 'Select an option',
  searchable = false,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No options available',
  cancelText,
  modalStyles = {},
}: DropdownPickerModalProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const { handlePressIn } = pressableAnimation();

  // React Compiler will optimize this filtering automatically
  const filteredItems = (() => {
    if (!searchable || !searchQuery.trim()) {
      return items;
    }

    const query = searchQuery.toLowerCase();
    return items.filter(item =>
      item.label.toLowerCase().includes(query) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(query))
    );
  })();

  const isSelected = (item: DropdownPickerItem<T>) => {
    if (selectedValue === null || selectedValue === undefined) return false;
    return item.value === selectedValue;
  };

  const handleItemSelect = (item: DropdownPickerItem<T>) => {
    if (item.disabled) return;
    onSelect(item.value, item);
    onClose?.();
  };

  const handleCancel = () => {
    onClose?.();
  };

  return (
    <View style={[styles.container, modalStyles.container]}>
      {/* Header */}
      {(title || searchable) && (
        <View style={[styles.header, modalStyles.header]}>
          {title && (
            <ThemedText
              type='defaultGantari'
              style={[styles.title, modalStyles.title]} selectable={false}>
              {title}
            </ThemedText>
          )}

          {searchable && (
            <View style={[styles.searchContainer, modalStyles.searchContainer]}>
              <TextInput
                style={[styles.searchInput, modalStyles.searchInput]}
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
          )}
        </View>
      )}

      {/* Items List */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={true}
      >
        {filteredItems.length === 0 ? (
          <View style={[styles.emptyContainer, modalStyles.emptyContainer]}>
            <ThemedText
              type='defaultGantari'
              style={[styles.emptyText, modalStyles.emptyText]} selectable={false}>
              {emptyMessage}
            </ThemedText>
          </View>
        ) : (
          filteredItems.map((item, index) => {
            const selected = isSelected(item);
            const isLastItem = index === filteredItems.length - 1;
            return (
              <Pressable
                key={`${item.value}-${index}`}
                onPress={() => handleItemSelect(item)}
                onPressIn={handlePressIn}
                style={({ pressed }) => [
                  styles.item,
                  modalStyles.item,
                  selected && [styles.selectedItem, modalStyles.selectedItem],
                  item.disabled && [styles.disabledItem, modalStyles.disabledItem],
                  isLastItem && { borderBottomWidth: 0 },
                  { opacity: pressed ? 0.1 : 1 },
                ]}
                disabled={item.disabled}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{
                  selected,
                  disabled: item.disabled
                }}
              >
                <View style={styles.itemContent}>
                  <ThemedText
                    type='defaultGantari'
                    style={[
                      styles.itemLabel,
                      modalStyles.itemLabel,
                      selected && [styles.selectedItemLabel, modalStyles.selectedItemLabel],
                      item.disabled && [styles.disabledItemLabel, modalStyles.disabledItemLabel],
                    ]}
                    selectable={false}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.label}
                  </ThemedText>

                  {item.subtitle && (
                    <ThemedText
                      type='defaultGantari'
                      style={[
                        styles.itemSubtitle,
                        modalStyles.itemSubtitle,
                        item.disabled && styles.disabledItemSubtitle,
                      ]}
                      selectable={false}
                      numberOfLines={2}
                      ellipsizeMode="tail"
                    >
                      {item.subtitle}
                    </ThemedText>
                  )}
                </View>

                {selected && (
                  <ThemedText type='defaultGantari' style={[styles.checkmark, modalStyles.checkmark]} selectable={false}>
                    ✓
                  </ThemedText>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, modalStyles.footer]}>
        <Pressable
          onPress={handleCancel}
          onPressIn={handlePressIn}
          style={({ pressed }) => [
            styles.cancelButton,
            modalStyles.cancelButton,
            { opacity: pressed ? 0.1 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={cancelText}
        >
          <ThemedText type='defaultGantari' style={[styles.cancelButtonText, modalStyles.cancelButtonText]} selectable={false}>
            {cancelText}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

// Keep the same styles...
const styles = StyleSheet.create((theme, rt) => ({
  container: {
    // backgroundColor: theme.colors.BackgroundSelect,
    borderRadius: 10,
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
      // boxShadow: '0px 0px 100px rgba(0, 187,119, 0.3)',
    }),
    // borderColor: theme.colors.neutral3,
    // borderWidth: 1,
    overflow: 'hidden',
    paddingLeft: 30,
    paddingRight: 12,

    // height: 300,
    width: 300,
  },
  header: {
    backgroundColor: theme.colors.BackgroundSelect,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: theme.colors.text,
    marginBottom: 16,
  },
  searchContainer: {
    marginTop: 8,
  },
  searchInput: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.neutral,
  },
  scrollView: {
    maxHeight: 300,

  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.subtitle,
    fontSize: 16,
    textAlign: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 5,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: theme.colors.neutral,
  },
  selectedItem: {
    color: theme.colors.primary,
  },
  disabledItem: {
    opacity: 0.5,
  },
  itemContent: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 16,
    color: theme.colors.text,
  },
  selectedItemLabel: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  disabledItemLabel: {
    color: theme.colors.subtitle,
  },
  itemSubtitle: {
    fontSize: 14,
    color: theme.colors.subtitle,
    marginTop: 2,
  },
  disabledItemSubtitle: {
    color: theme.colors.subtitle,
  },
  checkmark: {
    fontSize: 18,
    color: theme.colors.primary,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  footer: {
    // paddingHorizontal: 20,
    // paddingVertical: 16,
  },
  cancelButton: {
    height: 0,
    // backgroundColor: theme.colors.icon,
    // height: 50,
    // width: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 9999,
  },
  cancelButtonText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
}));