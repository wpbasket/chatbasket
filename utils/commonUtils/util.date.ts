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

// Internal helper to compute time difference parts between now and a given date
function getTimeDiffParts(dateString: string | undefined, now: Date = new Date()) {
  if (!dateString) return null;

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;

  const diffMs = now.getTime() - date.getTime();
  if (diffMs <= 0) {
    return {
      diffMs,
      seconds: 0,
      minutes: 0,
      hours: 0,
      days: 0,
      years: 0,
      months: 0,
      remainingDays: 0,
    };
  }

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const years = Math.floor(days / 365);
  const remainingDaysAfterYears = days % 365;
  const months = Math.floor(remainingDaysAfterYears / 30);
  const remainingDays = remainingDaysAfterYears % 30;

  return {
    diffMs,
    seconds,
    minutes,
    hours,
    days,
    years,
    months,
    remainingDays,
  };
}

/**
 * Formats a date string as a human-friendly relative time, e.g.:
 * "5 seconds ago", "2 hours ago", "3 days ago", "4 months ago",
 * "5 years ago", or combined like "3 months 2 days ago".
 */
export function formatRelativeTime(dateString: string | undefined, now: Date = new Date()): string {
  const diff = getTimeDiffParts(dateString, now);
  if (!diff) return '';

  if (diff.diffMs <= 0) return 'just now';

  const { seconds, minutes, hours, days, years, months, remainingDays } = diff;

  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  if (days < 30) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  const parts: string[] = [];

  if (years > 0) {
    parts.push(`${years} year${years === 1 ? '' : 's'}`);
  }

  if (months > 0) {
    parts.push(`${months} month${months === 1 ? '' : 's'}`);
  }

  if (years === 0 && remainingDays > 0) {
    // Only include days in the combined string when less than a year old
    parts.push(`${remainingDays} day${remainingDays === 1 ? '' : 's'}`);
  }

  if (parts.length === 0) {
    // Fallback: if somehow everything rounded to zero, show 30 days
    return '30 days ago';
  }

  return `${parts.join(' ')} ago`;
}

/**
 * Short relative time formatter using abbreviated units, but with full word for months.
 * Examples:
 * - "5s ago", "2min ago", "3h ago", "4d ago", "3 months 2d ago", "5y ago".
 */
export function formatRelativeTimeShort(dateString: string | undefined, now: Date = new Date()): string {
  const diff = getTimeDiffParts(dateString, now);
  if (!diff) return '';

  if (diff.diffMs <= 0) return 'now';

  const { seconds, minutes, hours, days, years, months, remainingDays } = diff;

  if (seconds < 60) {
    return `${seconds} s ago`;
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  if (hours < 24) {
    return `${hours} h ago`;
  }

  if (days < 30) {
    return `${days} d ago`;
  }

  const parts: string[] = [];

  if (years > 0) {
    parts.push(`${years} y`);
  }

  if (months > 0) {
    parts.push(`${months} month${months === 1 ? '' : 's'}`);
  }

  if (years === 0 && remainingDays > 0) {
    parts.push(`${remainingDays} d`);
  }

  if (parts.length === 0) {
    return '30 d ago';
  }

  return `${parts.join(' ')} ago`;
}
