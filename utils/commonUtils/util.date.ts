// Utility functions for date and time formatting
// Uses native Intl API for efficiency and cross-platform compatibility

/**
 * Formats a date string to display date and optionally time in a readable format.
 * @param dateString - The ISO date string to format.
 * @param includeTime - Whether to include the time in the output. Defaults to false.
 * @returns Formatted string like "16 October 2025" or "16 October 2025 at 11:05 AM", or empty string if invalid.
 */
export function formatDateTime(dateString: string | undefined, includeTime: boolean = false): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return ''; // Invalid date

  const formattedDate = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (!includeTime) return formattedDate;

  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  });

  return `${formattedDate} at ${formattedTime}`;
}
