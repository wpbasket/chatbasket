import { ApiError } from '@/lib/constantLib';
import { showAlert } from '@/utils/commonUtils/util.modal';

// Generic API error handler used across the app
// Behavior:
// - ApiError => "Something went wrong. Please try again later."
// - Non-ApiError => "Something unexpected happened. Please try again later."
export const showGenericError = (err: unknown) => {
  if (err instanceof ApiError) {
    showAlert('Something went wrong. Please try again later.');
  } else {
    showAlert('Something unexpected happened. Please try again later.');
  }
};
