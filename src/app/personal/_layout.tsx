import React from 'react';
import Sidebar from '@/components/sidebar/Sidebar';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import { useEffect } from 'react';
import { $syncEngine } from '@/state/personalState/chat/personal.state.sync';
import { startWSEventBridge, stopWSEventBridge } from '@/state/personalState/chat/ws.event.bridge';
import { PersonalUtilRefreshDeviceStatus } from '@/utils/personalUtils/personal.util.device';
import PersonalAppTabs from '@/components/personal.app.tabs';

export default function PersonalTabLayout() {

  useEffect(() => {
    setTimeout(() => {
      $syncEngine.catchUp();
    }, 3000);
    PersonalUtilRefreshDeviceStatus();

    // Start WebSocket real-time event bridge
    const wsTimer = setTimeout(() => {
      startWSEventBridge();
    }, 2000);

    return () => {
      clearTimeout(wsTimer);
      stopWSEventBridge();
    };
  }, []);

  return (
    <ThemedViewWithSidebar>
      <ThemedViewWithSidebar.Sidebar>
        <Sidebar />
      </ThemedViewWithSidebar.Sidebar>
      <ThemedViewWithSidebar.Main>
        <PersonalAppTabs />
      </ThemedViewWithSidebar.Main>
    </ThemedViewWithSidebar>
  );
}
