import { ApiError } from '@/lib/constantLib';
import { showAlert } from '@/utils/commonUtils/util.modal';

// All rate-limiting error types returned by the backend
export const RATE_LIMIT_ERRORS = ['brute_force_lockout', 'cooldown_active', 'daily_limit_exceeded', 'hourly_limit_exceeded'] as const;

// Check if an error type string is a rate-limit error
export const isRateLimitError = (type: string): boolean =>
  (RATE_LIMIT_ERRORS as readonly string[]).includes(type);

const getDailyLimitMessage = (message: string): string => {
  const retryAt = message.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/)?.[0];
  if (!retryAt) return 'Maximum limit reached. Please try again later.';

  const retryDate = new Date(retryAt);
  if (Number.isNaN(retryDate.getTime())) return 'Maximum limit reached. Please try again later.';

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const isToday =
    retryDate.getFullYear() === today.getFullYear() &&
    retryDate.getMonth() === today.getMonth() &&
    retryDate.getDate() === today.getDate();
  const isTomorrow =
    retryDate.getFullYear() === tomorrow.getFullYear() &&
    retryDate.getMonth() === tomorrow.getMonth() &&
    retryDate.getDate() === tomorrow.getDate();

  const dayLabel = isToday
    ? 'today'
    : isTomorrow
      ? 'tomorrow'
      : retryDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const timeLabel = retryDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const retryLabel = dayLabel === 'today' ? `after ${timeLabel}` : `${dayLabel} after ${timeLabel}`;
  return `Maximum limit reached. Please try again ${retryLabel}.`;
};

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
        showAlert(getDailyLimitMessage(err.message));
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
