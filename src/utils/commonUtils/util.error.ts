import { ApiError } from '@/lib/constantLib';
import { showAlert } from '@/utils/commonUtils/util.modal';

// All rate-limiting error types returned by the backend
export const RATE_LIMIT_ERRORS = ['brute_force_lockout', 'cooldown_active', 'daily_limit_exceeded', 'hourly_limit_exceeded'] as const;

// Check if an error type string is a rate-limit error
export const isRateLimitError = (type: string): boolean =>
  (RATE_LIMIT_ERRORS as readonly string[]).includes(type);

// Generic API error handler used across the app
// Behavior:
// - ApiError => "Something went wrong. Please try again later."
// - Non-ApiError => "Something unexpected happened. Please try again later."
export const showGenericError = (err: unknown) => {
  if (err instanceof ApiError) {
    switch (err.type) {
      case 'brute_force_lockout':
        showAlert('Too many failed attempts. Account locked for 15 minutes.');
        break;
      case 'daily_limit_exceeded':
        showAlert('Daily limit reached. Please try again tomorrow.');
        break;
      case 'hourly_limit_exceeded':
        showAlert('Too many requests. Please try again in an hour.');
        break;
      case 'cooldown_active':
        showAlert('Please wait before trying again.');
        break;
      default:
        showAlert('Something went wrong. Please try again later.');
    }
  } else {
    showAlert('Something unexpected happened. Please try again later.');
  }
};
