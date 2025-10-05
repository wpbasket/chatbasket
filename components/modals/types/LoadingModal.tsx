// components/modals/types/LoadingModal.tsx
import React from 'react';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import type { LoadingModalProps } from './modal.types';
import { modalActions } from '@/state/modals/modals.state';
import { ThemedText } from '@/components/ui/common/ThemedText';

export function LoadingModal(props: LoadingModalProps) {
  const { message, cancellable, onCancel } = props;
  const {theme} = useUnistyles();

  const handleCancel = () => {
    try {
      onCancel?.();
    } finally {
      modalActions.close();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <ActivityIndicator color={theme.colors.primaryWhite} size="small" />
        {message ? (
          <View style={styles.textWrap}>
            <ThemedText type='defaultGantari' style={styles.message}>{message}</ThemedText>
          </View>
        ) : null}
      </View>
      {cancellable ? (
        <Pressable onPress={handleCancel} style={styles.cancelBtn}>
          <ThemedText type='defaultGantari' style={styles.cancelText}>Cancel</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme,rt) => ({
  container: {
    minWidth: 200,
    
    maxWidth: 300,
    paddingVertical: {
      xs: 7,
      sm: 7,
      md: 7,
      lg: 8
    },
    paddingLeft: 12,
    paddingRight:35,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopRightRadius: 25,
    
    ...(rt.themeName == 'dark' ? {
      
      backgroundColor:'rgba(13,13,13,0.9)',
      boxShadow: '0px 10px 15px rgba(15,15,15,0.2)',
      borderColor: theme.colors.neutral4,
      borderWidth: 1,
    } : {
      backgroundColor:theme.colors.primary,
      // backgroundColor: theme.colors.BackgroundSelect,
      // boxShadow: '0px 10px 15px rgba(0,0,0,0.2)',
      // boxShadow: '0px 0px 100px rgba(0, 187,119, 0.1)',
      // borderColor: {
      //   xs: theme.colors.neutral,
      //   sm: theme.colors.neutral,
      //   md: theme.colors.neutral,
      //   lg: theme.colors.neutral2
      // },
      // borderWidth: 1,
    }),

    alignItems: 'stretch',
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textWrap: {
    alignItems: 'flex-start',
    gap: 2,
  },
  message: {
    fontSize: 15,
    color: theme.colors.white,
    // fontWeight:'bold',
    textAlign: 'left',
  },
  cancelBtn: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.neutral3 || '#eee',
  },
  cancelText: {
    color: theme.colors.text,
  },
}));
