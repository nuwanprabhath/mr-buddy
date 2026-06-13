import { relativeTime } from '../treeProvider';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function dateAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

describe('relativeTime', () => {
  it('returns "just now" for less than 1 minute', () => {
    expect(relativeTime(dateAgo(30 * 1000))).toBe('just now');
  });

  it('returns "just now" for exactly 1 minute', () => {
    expect(relativeTime(dateAgo(MINUTE))).toBe('just now');
  });

  it('returns minutes for 2–59 minutes', () => {
    expect(relativeTime(dateAgo(2 * MINUTE))).toBe('2 minutes ago');
    expect(relativeTime(dateAgo(45 * MINUTE))).toBe('45 minutes ago');
    expect(relativeTime(dateAgo(59 * MINUTE))).toBe('59 minutes ago');
  });

  it('returns "1 hour ago" for exactly 1 hour', () => {
    expect(relativeTime(dateAgo(HOUR))).toBe('1 hour ago');
  });

  it('returns hours for 2–23 hours', () => {
    expect(relativeTime(dateAgo(2 * HOUR))).toBe('2 hours ago');
    expect(relativeTime(dateAgo(22 * HOUR))).toBe('22 hours ago');
    expect(relativeTime(dateAgo(23 * HOUR + 59 * MINUTE))).toBe('23 hours ago');
  });

  it('returns "yesterday" for 1 day', () => {
    expect(relativeTime(dateAgo(DAY))).toBe('yesterday');
    expect(relativeTime(dateAgo(DAY + 23 * HOUR))).toBe('yesterday');
  });

  it('returns days for 2–29 days', () => {
    expect(relativeTime(dateAgo(2 * DAY))).toBe('2 days ago');
    expect(relativeTime(dateAgo(15 * DAY))).toBe('15 days ago');
    expect(relativeTime(dateAgo(29 * DAY))).toBe('29 days ago');
  });

  it('returns "1 month ago" for 1 month', () => {
    expect(relativeTime(dateAgo(30 * DAY))).toBe('1 month ago');
  });

  it('returns months for 2–11 months', () => {
    expect(relativeTime(dateAgo(60 * DAY))).toBe('2 months ago');
    expect(relativeTime(dateAgo(330 * DAY))).toBe('11 months ago');
  });

  it('returns "1 year ago" for 1 year', () => {
    expect(relativeTime(dateAgo(365 * DAY))).toBe('1 year ago');
  });

  it('returns years for 2+ years', () => {
    expect(relativeTime(dateAgo(730 * DAY))).toBe('2 years ago');
  });
});
