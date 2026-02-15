import Header from '@/components/header/Header';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { router, Stack } from 'expo-router';
import { StyleSheet, UnistylesRuntime, useUnistyles } from 'react-native-unistyles';
import type { DropdownPickerItem } from '@/components/modals/types/modal.types';
import { Dropdown } from '@/components/ui/common/DropDown';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { useNotificationPermission } from '@/hooks/commonHooks/hooks.notificationPermission';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { settingApi } from '@/lib/commonLib/settingApi/common.api.setting';
import { PreferencesStorage } from '@/lib/storage/commonStorage/storage.preferences';
import { openNotificationSettingsFromApp } from '@/notification/registerFcmOrApn';
import { setAppMode } from '@/state/appMode/state.appMode';
import { authState } from '@/state/auth/state.auth';
import { setting$ } from '@/state/settings/state.setting';
import { hideModal, showControllersModal } from '@/utils/commonUtils/util.modal';
import { useResendCooldown } from '@/utils/commonUtils/util.resendCooldown';
import { useValue } from '@legendapp/state/react';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import CreateSettingsFlows from './settings.flows';

export default function Settings() {
  const MAX_RESENDS = 3;
  const COOLDOWN_MS = 120_000;
  const { theme, rt } = useUnistyles();

  useEffect(() => {
    // Clean up when component unmounts
    return () => {
      setting$.reset()
      authState.isInTheProfileUpdateMode.set(false)
    };
  }, []);

  useNotificationPermission();

  const { handlePressIn } = pressableAnimation();
  const email = useValue(authState.user.email);

  const { editEmail, editPassword } = CreateSettingsFlows({
    settingApi,
    showControllersModal,
    hideModal,
    handlePressIn,
    styles,
    MAX_RESENDS,
    COOLDOWN_MS,
    currentEmail$: authState.user.email,
  });

  const goBack = () => {
    router.back();
  };

  // Reusable cooldown ticker
  useResendCooldown(setting$);

  const setDeviceTheme = () => {
    // Clear stored preference so unistyles initialTheme falls back to device
    PreferencesStorage.clearTheme()
    const system = UnistylesRuntime.colorScheme === 'dark' ? 'dark' : 'light'
    UnistylesRuntime.setTheme(system)
  }

  const setLightTheme = () => {
    PreferencesStorage.setTheme('light')
    UnistylesRuntime.setTheme('light')
  }

  const setDarkTheme = () => {
    PreferencesStorage.setTheme('dark')
    UnistylesRuntime.setTheme('dark')
  }

  // Dropdown state mapping
  type ThemeOption = 'device' | 'light' | 'dark'
  const themeOptions: DropdownPickerItem<ThemeOption>[] = [
    { label: 'Device', value: 'device' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
  ]

  // Determine currently selected option based on stored preference
  const storedPref = PreferencesStorage.getTheme()
  const selectedThemeValue: ThemeOption = storedPref === 'light' || storedPref === 'dark' ? storedPref : 'device'

  const handleSelectTheme = (value: ThemeOption) => {
    if (value === 'device') {
      setDeviceTheme()
      return goBack()
    }
    if (value === 'light') {
      setLightTheme()
      return goBack()
    }
    if (value === 'dark') {
      setDarkTheme()
      return goBack()
    }
  }

  // App Mode selector
  type ModeOption = 'public' | 'personal'
  const modeOptions: DropdownPickerItem<ModeOption>[] = [
    { label: 'Public', value: 'public' },
    { label: 'Personal', value: 'personal' },
  ]
  const storedMode = PreferencesStorage.getMode?.()
  const selectedModeValue: ModeOption = storedMode === 'personal' ? 'personal' : 'public'
  const handleSelectMode = (value: ModeOption) => {
    if (PreferencesStorage.setMode) PreferencesStorage.setMode(value)
    setAppMode(value)
    // Navigate to the corresponding home screen
    router.push(value === 'public' ? '/public/home' : '/personal/home')
  }

  type NotificationOption = 'enabled' | 'disabled'
  const selectedNotificationValue = useValue(setting$.notifications)

  const notificationDisplayOptions: DropdownPickerItem<NotificationOption>[] = [
    { label: 'Enabled', value: 'enabled' },
    { label: 'Disabled', value: 'disabled' },
  ]

  const notificationActionOptions: DropdownPickerItem<NotificationOption>[] =
    selectedNotificationValue === 'enabled'
      ? [{ label: 'Disable', value: 'disabled' }]
      : [{ label: 'Enable', value: 'enabled' }]

  const handleSelectNotifications = async (value: NotificationOption) => {
    void value;
    await openNotificationSettingsFromApp();
  }

  return (
    <ThemedView style={styles.mainContainer}>
      <ThemedView style={{ paddingTop: rt.insets.top }}>
        <Header
          onBackPress={goBack}
          centerSection={<ThemedText type='subtitle'>Settings</ThemedText>}
        />
      </ThemedView>
      <View style={styles.container}>
        <View style={[styles.flex1, { marginTop: 20 }]}>
          <ThemedText style={styles.sectionHeader}>Security</ThemedText>
          <View style={styles.section}>
            <View style={styles.itemTitleContainer}>
              <ThemedText style={styles.itemTitle}>Email :</ThemedText>
            </View>
            <View style={styles.itemContainer}>
              <ThemedText style={styles.item}>{email}</ThemedText>
            </View>
            <Pressable
              onPress={editEmail}
              onPressIn={handlePressIn}
              style={({ pressed }) => [
                { opacity: pressed ? 0.1 : 1 },
                styles.changeContainer
              ]}

            >
              <MaterialCommunityIcon size={25} name={'account.emailEdit'} />
            </Pressable>
          </View>

          <View style={styles.section}>
            <View style={styles.itemTitleContainer}>
              <ThemedText style={styles.itemTitle}>Password :</ThemedText>
            </View>
            <View style={styles.itemContainer}>
              <ThemedText style={styles.item}>******</ThemedText>
            </View>
            <Pressable
              onPress={editPassword}
              onPressIn={handlePressIn}
              style={({ pressed }) => [
                { opacity: pressed ? 0.1 : 1 },
                styles.changeContainer
              ]}
            >
              <MaterialCommunityIcon size={25} name={'edit'} />
            </Pressable>
          </View>

          <ThemedText style={styles.sectionHeader}>Preferences</ThemedText>

          <View style={styles.section}>
            <View style={styles.itemTitleContainer}>
              <ThemedText style={styles.itemTitle}>Mode :</ThemedText>
            </View>
            <View style={styles.themePickerContainer}>
              <Dropdown
                placeholder='Choose mode'
                value={selectedModeValue}
                options={modeOptions}
                onSelect={handleSelectMode}
                style={styles.dropdownBorder}
              />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.itemTitleContainer}>
              <ThemedText style={styles.itemTitle}>Notifications :</ThemedText>
            </View>
            <View style={styles.themePickerContainer}>
              <Dropdown
                placeholder='Notifications'
                value={selectedNotificationValue}
                options={notificationDisplayOptions}
                modalOptions={notificationActionOptions}
                onSelect={handleSelectNotifications}
                style={styles.dropdownBorder}
              />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.itemTitleContainer}>
              <ThemedText style={styles.itemTitle}>Theme :</ThemedText>
            </View>
            <View style={styles.themePickerContainer}>
              <Dropdown
                placeholder='Choose theme'
                value={selectedThemeValue}
                options={themeOptions}
                onSelect={handleSelectTheme}
                style={styles.dropdownBorder}
              />
            </View>
          </View>
        </View>
      </View>
    </ThemedView>
  )
}

const styles = StyleSheet.create((theme, rt) => ({
  mainContainer: {
    flex: 1,
    gap: 20,
  },
  container: {
    flex: 1,
    gap: 20,
    paddingHorizontal: 20,
  },
  flex1: {
    flex: 1,
    gap: 15,
  },
  section: {
    flexDirection: 'row',
    width: 367,
    justifyContent: 'space-between',
  },
  sectionHeader: {
    fontSize: 18,
    marginBottom: -5,
    color: theme.colors.primary,
  },
  itemTitleContainer: {
    width: 100,
  },
  itemTitle: {
    fontSize: 15,
    color: theme.colors.whiteOrBlack,
  },
  itemContainer: {
    width: 241,
    paddingRight: 10,
  },
  item: {
    fontSize: 15,
  },
  changeContainer: {
    width: 30,
    height: 25,
    gap: 2,
    alignItems: 'center',
  },
  themePickerContainer: {
    width: 267,
    height: 30,
    borderColor: theme.colors.neutral5,
    borderWidth: 1,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    justifyContent: 'center',
  },
  dropdownBorder: {
    height: 27,
    width: 265,
    borderWidth: 0,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 8,
    borderTopRightRadius: 25,
    paddingHorizontal: 16,
  },
  primaryText: {
    color: theme.colors.primary,
  },
  modalInput: {
    height: 40,
    fontSize: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.colors.neutral4,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 8,
    borderTopRightRadius: 25,
    color: theme.colors.whiteOrBlack,
  },
  inputError: {
    borderColor: 'red',
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  modalActionButton: {
    backgroundColor: theme.colors.icon,
    height: 60,
    width: 60,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionText: {
    color: theme.colors.blackOrWhite,
    fontWeight: 'bold',
  },
  actionRightRow: {
    width: '100%',
    alignItems: 'flex-end',
  },
  modalPillButton: {
    backgroundColor: theme.colors.icon,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
