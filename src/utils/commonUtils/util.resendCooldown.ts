// utils/resendCooldown.util.ts
import { useEffect } from 'react';

// Expects a Legend state object with resendExpiryAt and resendCooldown nodes
// that support .get() / .set()
export function useResendCooldown(state$: any) {
  useEffect(() => {
    const interval = setInterval(() => {
      const expiry = state$.resendExpiryAt.get();
      if (!expiry) {
        if (state$.resendCooldown.get() !== 0) state$.resendCooldown.set(0);
        return;
      }
      const diff = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
      state$.resendCooldown.set(diff);
      if (diff === 0) {
        state$.resendExpiryAt.set(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state$]);
}