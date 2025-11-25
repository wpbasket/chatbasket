import { appMode$ } from '@/state/appMode/state.appMode';
import { useValue } from '@legendapp/state/react';
import { Redirect } from 'expo-router';

export default function HomeScreen() {
  const mode = useValue(appMode$.mode);
  if (mode === 'public') {
    return <Redirect href="/public/home" />;
  } else {
    return <Redirect href="/personal/home" />;
  }
}
