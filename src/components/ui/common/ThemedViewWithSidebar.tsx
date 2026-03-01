import React from 'react';
import { StyleSheet } from 'react-native-unistyles';
import { ThemedView, type ThemedViewProps } from '@/components/ui/common/ThemedView';

export type ThemedViewWithSidebarProps = ThemedViewProps & {
  /**
   * Content to render - should include ThemedViewWithSidebar.Sidebar and ThemedViewWithSidebar.Main
   */
  children: React.ReactNode;
  /**
   * Additional styles for the outer container
   */
  outerContainerStyle?: any;
};

export type SidebarProps = ThemedViewProps & {
  children: React.ReactNode;
};

export type MainProps = ThemedViewProps & {
  children: React.ReactNode;
};

function ThemedViewWithSidebarRoot({
  children,
  outerContainerStyle,
  style,
  ...otherProps
}: ThemedViewWithSidebarProps) {
  return (
    <ThemedView style={[styles.outerContainer, outerContainerStyle]} {...otherProps}>
      <ThemedView style={[styles.divider, style]}>
        {children}
      </ThemedView>
    </ThemedView>
  );
}

function ThemedViewWithSidebarSidebar({ children, style, ...otherProps }: SidebarProps) {
  return (
    <ThemedView style={[styles.websidebar, style]} {...otherProps}>
      {children}
    </ThemedView>
  );
}

function ThemedViewWithSidebarMain({ children, style, ...otherProps }: MainProps) {
  return (
    <ThemedView style={[styles.mainContainer, style]} {...otherProps}>
      {children}
    </ThemedView>
  );
}

export const ThemedViewWithSidebar = Object.assign(ThemedViewWithSidebarRoot, {
  Sidebar: ThemedViewWithSidebarSidebar,
  Main: ThemedViewWithSidebarMain,
});

const styles = StyleSheet.create((theme, rt) => ({
  outerContainer: {
    flex: 1,
    paddingRight: {
      xs: 0,
      sm: 0,
      md: 0,
      lg: 0,
      xl: 200,
      xl2: 400,
      superLarge: 500
    }
  },
  divider: {
    flex: 1,
    flexDirection: 'row',
  },
  websidebar: {
    width: {
      xs: 0,
      sm: 0,
      md: 0,
      lg: 250,
    },
    borderRightColor: theme.colors.neutral0,
    borderRightWidth: {
      xs: 0,
      sm: 0,
      md: 0,
      lg: 1
    },
    display: {
      xs: 'none',
      sm: 'none',
      md: 'none',
      lg: 'flex',
    },
  },
  mainContainer: {
    flex: 1,
    width: '100%',
  },
}));