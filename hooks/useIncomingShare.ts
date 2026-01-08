import { showAlert } from '@/utils/commonUtils/util.modal';
import { useShareIntent } from 'expo-share-intent';
import { useEffect } from 'react';

export function useIncomingShare() {
    const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

    useEffect(() => {
        if (hasShareIntent && shareIntent) {
            // showAlert('Incoming Share', JSON.stringify(shareIntent));

            if (shareIntent.files) {
                // showAlert('Incoming Share', JSON.stringify(shareIntent.files));
            }

            // Consume the intent so it doesn't trigger again
            resetShareIntent();
        }
    }, [hasShareIntent, shareIntent, resetShareIntent]);

    // Return values if needed for other components, but mostly this hook is for side effects
    return { hasShareIntent, shareIntent, resetShareIntent };
}

export const IncomingShareListener = () => {
    useIncomingShare();
    return null;
};
