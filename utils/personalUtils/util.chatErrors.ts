import type { ApiError } from '@/lib/constantLib/models/model.api';

/**
 * Maps backend error `type` strings to user-friendly messages.
 * Covers all error types returned by chat_service.go.
 */
const CHAT_ERROR_MAP: Record<string, string> = {
    // ── Auth errors ──
    unauthorized: 'Please sign in to continue.',

    // ── Validation errors ──
    bad_request: 'Something went wrong. Please try again.',
    invalid_recipient: 'Invalid recipient.',
    invalid_chat_id: 'This chat could not be found.',

    // ── Eligibility errors ──
    messaging_not_allowed: 'This account is not available for messaging.',
    messaging_not_allowed_not_in_contacts: 'You must add this person as a contact before messaging.',
    messaging_not_allowed_recipient_private: 'This person has a private profile. You cannot send new messages.',
    messaging_not_allowed_blocked_by_recipient: 'You cannot send messages. The recipient {name} has blocked you.',
    messaging_not_allowed_blocked_by_me: 'You have blocked this person. Unblock to send a message.',
    messaging_not_allowed_admin_blocked: 'This account has been restricted.',
    messaging_not_allowed_no_primary_device: 'This account is not available for messaging.',
    messaging_not_allowed_recipient_not_found: 'This account is no longer active.',

    // ── Access errors ──
    chat_access_denied: 'You don\'t have access to this conversation.',
    chat_not_found: 'This conversation could not be found.',
};

/**
 * Extracts a user-friendly error message from any error.
 * Priority: ApiError.type → ApiError.message → generic fallback.
 */
export function getChatErrorMessage(
    err: unknown,
    fallback = 'Something went wrong. Please try again later.',
    options?: { name?: string }
): string {
    if (!err) return fallback;

    // ApiError thrown by apiClient
    if (isApiError(err)) {
        let mapped = CHAT_ERROR_MAP[err.type];
        if (mapped) {
            if (options?.name) {
                mapped = mapped.replace('{name}', options.name);
            } else {
                mapped = mapped.replace('{name}', 'this person');
            }
            return mapped;
        }

        // If message is human-readable (not a snake_case code), use it
        if (err.message && !err.message.includes('_')) {
            return err.message;
        }
        return fallback;
    }

    // Axios-style error (legacy)
    const axiosMsg = (err as any)?.response?.data?.message;
    if (typeof axiosMsg === 'string' && axiosMsg.length > 0) {
        const axiosType = (err as any)?.response?.data?.type;
        if (axiosType && CHAT_ERROR_MAP[axiosType]) {
            return CHAT_ERROR_MAP[axiosType];
        }
        if (!axiosMsg.includes('_')) return axiosMsg;
    }

    // Plain Error
    if (err instanceof Error && err.message) {
        if (!err.message.includes('_')) return err.message;
    }

    return fallback;
}

/**
 * Maps a raw eligibility `reason` string (from CheckEligibilityHandler)
 * to a user-friendly message.
 */
export function getEligibilityMessage(reason: string, options?: { name?: string }): string {
    const map: Record<string, string> = {
        not_in_contacts: 'You must add this person as a contact before messaging.',
        recipient_private: 'This person has a private profile. You cannot send new messages.',
        blocked: 'This account is not available for messaging.', // Legacy
        blocked_by_recipient: 'You cannot send messages. The recipient {name} has blocked you.',
        blocked_by_me: 'You have blocked this person. Unblock to send a message.',
        admin_blocked: 'This account has been restricted.',
        no_primary_device: 'This account is not available for messaging.',
        recipient_not_found: 'This account is no longer active.',
    };
    let message = map[reason] ?? 'This account is not available for messaging.';
    if (options?.name) {
        message = message.replace('{name}', options.name);
    } else {
        message = message.replace('{name}', 'this person');
    }
    return message;
}

/** Type guard for ApiError. */
function isApiError(err: unknown): err is ApiError {
    return (
        err instanceof Error &&
        'code' in err &&
        'type' in err
    );
}
