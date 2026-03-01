import PublicAppTabs from '@/components/public.app.tabs';
import Sidebar from '@/components/sidebar/Sidebar';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import React from 'react';

export default function TabLayout() {
  return (
    <ThemedViewWithSidebar>
      <ThemedViewWithSidebar.Sidebar>
        <Sidebar />
      </ThemedViewWithSidebar.Sidebar>
      <ThemedViewWithSidebar.Main>
        <PublicAppTabs />
      </ThemedViewWithSidebar.Main>
    </ThemedViewWithSidebar>
  );
}
