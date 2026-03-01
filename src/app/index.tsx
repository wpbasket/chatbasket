import { appMode$ } from '@/state/appMode/state.appMode';
import { useValue } from '@legendapp/state/react';
import { Redirect, useSegments } from 'expo-router';

export default function HomeScreen() {
  const mode = useValue(appMode$.mode);
  const segments = useSegments();

  // CRITICAL FIX: If we have segments (meaning we are deep linked or navigated somewhere),
  if (segments.length > 0) {
    return null;
  }

  // Simple redirect based on current mode
  // Deep links will go directly to their route, bypassing this component
  if (mode === 'public') {
    return <Redirect href="/public/home" />;
  } else {
    return <Redirect href="/personal/home" />;
  }
}