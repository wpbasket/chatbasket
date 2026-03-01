import { PreferencesStorage } from '@/lib/storage/commonStorage/storage.preferences';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';
import { Colors } from './src/constants/Colors';
import { Fonts } from './src/constants/fonts';

// Define Unistyles themes using your current Colors.ts structure
const lightTheme = {
  colors: Colors.light,
  fonts: Fonts.light,
  gap: (v: number) => v * 8,
  elevation20:20
  
};
const darkTheme = {
  colors: Colors.dark,
  fonts: Fonts.dark,
  gap: (v: number) => v * 8,
  elevation20:0
};

type AppThemes = {
  light: typeof lightTheme,
  dark: typeof darkTheme,
};

// Define breakpoints (customize as needed)
const breakpoints = {
  xs: 0,
  sm: 300,
  md: 500,
  lg: 800,
  xl: 1200,
  xl2: 1600,
  superLarge: 1860,
};

// TypeScript type augmentation for Unistyles
// (enables autocomplete and type safety)
// type AppThemes = typeof AppThemes;
type AppBreakpoints = typeof breakpoints;
declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

// Configure Unistyles
StyleSheet.configure({
  themes: {
    light: lightTheme,
    dark: darkTheme,
  },
  breakpoints,
  settings: {
    adaptiveThemes: false, // Enable adaptive themes
    initialTheme: () => {
      // Prefer user's saved preference if available
      const saved = PreferencesStorage.getTheme()
      if (saved === 'light' || saved === 'dark') return saved
      // Fallback to system color scheme
      return UnistylesRuntime.colorScheme === 'dark' ? 'dark' : 'light'
    },
  },
});
