import Header from '@/components/header/Header';
import { commonAuthApi } from '@/lib/commonLib/authApi/common.api.auth';
import type { DropdownPickerItem } from '@/components/modals/types/modal.types';
import { Dropdown } from '@/components/ui/common/DropDown';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { useNotificationPermission } from '@/hooks/commonHooks/hooks.notificationPermission';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { PreferencesStorage } from '@/lib/storage/commonStorage/storage.preferences';
import { PersonalStorageSetDeviceStatus } from '@/lib/storage/personalStorage/personal.storage.device';
import { openNotificationSettingsFromApp } from '@/notification/registerFcmOrApn';
import { setAppMode } from '@/state/appMode/state.appMode';
import { authState } from '@/state/auth/state.auth';
import { $personalStateUser } from '@/state/personalState/user/personal.state.user';
import { setting$ } from '@/state/settings/state.setting';
import { hideModal, runWithLoading, showAlert, showConfirmDialog, showControllersModal } from '@/utils/commonUtils/util.modal';
import { useResendCooldown } from '@/utils/commonUtils/util.resendCooldown';
import { useValue } from '@legendapp/state/react';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { UnistylesRuntime, useUnistyles } from 'react-native-unistyles';
import SettingsEmailRow from './components/SettingsEmailRow';
import SettingsPasswordRow from './components/SettingsPasswordRow';
import CreateSettingsFlows from './settings.flows';
import styles from './settings.styles';
import { settingApi } from '@/lib/commonLib/settingApi/common.api.setting';
import { PersonalSettingApi } from '@/lib/personalLib/settingApi/personal.api.setting';

export default function Settings() {
  const { rt } = useUnistyles();
  const MAX_RESENDS = 3;
  const COOLDOWN_MS = 120_000;
  useEffect(() => {
    // Clean up when component unmounts
    return () => {
      setting$.reset()
      authState.isInTheProfileUpdateMode.set(false)
    };
  }, []);

  useNotificationPermission();

  const { handlePressIn } = pressableAnimation();
  const email = useValue($personalStateUser.user.email);

  const { editEmail, editPassword } = CreateSettingsFlows({
    settingApi,
    showControllersModal,
    hideModal,
    handlePressIn,
    styles,
    MAX_RESENDS,
    COOLDOWN_MS,
    currentEmail$: $personalStateUser.user.email,
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

  // Device Type State
  const isPrimary = useValue(authState.isPrimary);
  const deviceType = isPrimary === null ? 'Not fetched' : (isPrimary ? 'Primary' : 'Secondary');

  // Effect to fetch initial status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await commonAuthApi.getMe();
        if (response) {
          await PersonalStorageSetDeviceStatus({
            isPrimary: response.isPrimary,
            deviceName: response.primaryDeviceName || null
          });
        }
      } catch (e) {
        // Fallback to existing authState
      }
    };
    checkStatus();
  }, []);

  const handleSetCentralDevice = async () => {
    let response;
    try {
      response = await runWithLoading(async () => {
        return await commonAuthApi.getMe();
      }, { message: 'Checking status...' });
    } catch (e) {
      return;
    }

    if (!response) return;

    // Update state based on fresh response
    await PersonalStorageSetDeviceStatus({
      isPrimary: response.isPrimary,
      deviceName: response.primaryDeviceName || null
    });

    if (response.isPrimary) {
      showAlert("This device is already set as your Primary Device.");
      return;
    }

    const existingName = response.primaryDeviceName || 'Another Device';

    const confirm = await showConfirmDialog(
      <>
        This device is currently NOT your Primary Device. "
        <ThemedText style={{ color: 'red', fontWeight: 'bold' }}>{existingName}</ThemedText>
        " is currently set as Primary. Do you want to switch?
      </>,
      {
        confirmText: 'Switch',
        cancelText: 'Keep as Secondary',
        confirmVariant: 'default'
      }
    );

    if (confirm) {
      try {
        await runWithLoading(async () => {
          await PersonalSettingApi.setCentralDevice();
          await PersonalStorageSetDeviceStatus({ isPrimary: true, deviceName: null });
        }, { message: "Updating..." });
        showAlert("Primary Device updated successfully.");
      } catch (e) {
        // Error already handled
      }
    }
  };

  return (
    <ThemedView style={styles.mainContainer}>
      <ThemedView style={{ paddingTop: rt.insets.top }}>
        <Header
          onBackPress={goBack}
          centerSection={<ThemedText type='subtitle'>Settings</ThemedText>}
        />
      </ThemedView>
      <View style={styles.container}>
        <View style={[styles.flex1, { marginTop: -20 }]}>
          <ThemedText style={styles.sectionHeader}>Security</ThemedText>
          <SettingsEmailRow
            email={email}
            onPress={editEmail}
            onPressIn={handlePressIn}
          />
          <SettingsPasswordRow
            onPress={editPassword}
            onPressIn={handlePressIn}
          />

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
            {/* <View style={styles.itemContainer}>
                  <IconSymbol name='theme' size={25}/>
                </View> */}
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

          {Platform.OS !== 'web' && (
            <View style={styles.section}>
              <View style={styles.itemTitleContainer}>
                <ThemedText style={styles.itemTitle}>Device Type :</ThemedText>
              </View>
              <View style={styles.themePickerContainer}>
                <Pressable onPress={handleSetCentralDevice} style={[styles.dropdownBorder, { justifyContent: 'center' }]}>
                  <ThemedText type='default'>{deviceType}</ThemedText>
                </Pressable>
              </View>
            </View>
          )}


        </View>
      </View>
    </ThemedView>
  );
}