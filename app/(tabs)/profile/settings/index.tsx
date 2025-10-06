import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { router } from 'expo-router';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';
// import { authState } from '@/state/auth/auth';
import Header from '@/components/header/Header';
import type { DropdownPickerItem } from '@/components/modals/types/modal.types';
import Sidebar from '@/components/sidebar/Sidebar';
import { Dropdown } from '@/components/ui/common/DropDown';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { pressableAnimation } from '@/hooks/pressableAnimation';
import { useLegend$ } from '@/hooks/useLegend';
import { settingApi } from '@/lib/publicLib/api/settingApi/api.setting';
import { PreferencesStorage } from '@/lib/storage/preferences.storage';
import { setAppMode } from '@/state/appMode/mode.state';
import { authState } from '@/state/auth/auth.state';
import { setting$ } from '@/state/settings/setting.state';
import { hideModal, showControllersModal } from '@/utils/modal.util';
import { useResendCooldown } from '@/utils/resendCooldown.util';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import CreateSettingsFlows from './settings.flows';

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
  const email = useLegend$(authState.user.email);

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
                  {/* <ThemedText type='small' style={styles.changeText} color='red' >Change</ThemedText> */}

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
                  {/* <ThemedText type='small' style={styles.changeText} color='red' >Change</ThemedText> */}

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

const styles = StyleSheet.create((theme, rt) => (({
  mainContainer: {
    flex: 1,
    paddingTop: rt.insets.top,
    gap: 20,

  },
  container: {
    flex: 1,
    gap: 20,
    paddingHorizontal: 20,
    // backgroundColor: theme.colors.yellow,
  },
  flex1: {
    flex: 1,
    gap: 15,
  },
  section: {
    flexDirection: 'row',
    // backgroundColor:'red',
    width: 367
  },
  sectionHeader: {
    fontSize: 18,
    marginBottom: -5,
    color: theme.colors.primary
  },
  itemTitleContainer: {
    // flex: 1,
    width: 100,
    // backgroundColor: 'yellow'
  },
  itemTitle: {
    fontSize: 15,
    color: theme.colors.whiteOrBlack,
    // fontWeight: 'bold',
  },
  itemContainer: {
    width: 241,
    paddingRight: 10,
    // backgroundColor: 'pink',
  },
  item: {
    fontSize: 15,
  },
  changeContainer: {
    width: 30,
    height: 25,
    gap: 2,
    alignItems: 'center',
    // flexDirection: 'row',
    // backgroundColor: 'blue'
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

})));