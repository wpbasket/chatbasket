import { useLegend$ } from '@/hooks/commonHooks/hooks.useLegend';
import { appMode$ } from '@/state/appMode/state.appMode';
import { Redirect } from 'expo-router';

export default function HomeScreen() {
  const mode = useLegend$(appMode$.mode);
  if (mode === 'public') {
    return <Redirect href="/(tabs)/home" />;
  } else {
    return <Redirect href="/personal/home" />;
  }
}
