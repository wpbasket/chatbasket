import Header from '@/components/header/Header';
import type { DropdownPickerItem } from '@/components/modals/types/modal.types';
import Sidebar from '@/components/sidebar/Sidebar';
import { Dropdown } from '@/components/ui/common/DropDown';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { settingApi } from '@/lib/publicLib/settingApi/public.api.setting';
import { PreferencesStorage } from '@/lib/storage/commonStorage/storage.preferences';
import { setAppMode } from '@/state/appMode/state.appMode';
import { authState } from '@/state/auth/state.auth';
import { $personalStateUser } from '@/state/personalState/user/personal.state.user';
import { setting$ } from '@/state/settings/state.setting';
import { hideModal, showControllersModal } from '@/utils/commonUtils/util.modal';
import { useResendCooldown } from '@/utils/commonUtils/util.resendCooldown';
import { useValue } from '@legendapp/state/react';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { UnistylesRuntime } from 'react-native-unistyles';
import { SettingsEmailRow } from './components/SettingsEmailRow';
import { SettingsPasswordRow } from './components/SettingsPasswordRow';
import CreateSettingsFlows from './settings.flows';
import { styles } from './settings.styles';

export default function Settings() {
  const MAX_RESENDS = 3;
  const COOLDOWN_MS = 120_000;
  useEffect(() => {
    // Clean up when component unmounts
    return () => {
      setting$.reset()
      authState.isInTheProfileUpdateMode.set(false)
    };
  }, []);

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
  }

  return (
    <ThemedViewWithSidebar>
      <ThemedViewWithSidebar.Sidebar>
        <Sidebar />
      </ThemedViewWithSidebar.Sidebar>
      <ThemedViewWithSidebar.Main>

        <ThemedView style={styles.mainContainer}>
          <Header
            leftButton={{
              child: <IconSymbol name='arrow.left' />,
              onPress: goBack,
            }}
            centerIcon={true}
            Icon={<ThemedText type='subtitle'>Settings</ThemedText>}
          />
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


            </View>
          </View>



        </ThemedView>
        {/* mainContainer */}
      </ThemedViewWithSidebar.Main>
    </ThemedViewWithSidebar>
  )
}