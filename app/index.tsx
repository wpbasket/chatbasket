import { use$ } from '@legendapp/state/react';
import { Redirect } from 'expo-router';
import { appMode$ } from '@/state/appMode/mode.state';

export default function HomeScreen() {
  const mode = use$(appMode$.mode);
  if (mode === 'public') {
    return <Redirect href="/(tabs)/home" />;
  } else {
    return <Redirect href="/personal/home" />;
  }
}
