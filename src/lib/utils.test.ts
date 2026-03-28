import { describe, it, expect, vi, afterEach } from 'vitest';
import { shortHash, relativeTime, projectTimestampLabel } from './utils';

// ── shortHash ──────────────────────────────────────────────────────────────────

describe('shortHash', () => {
  it('returns empty string for null', () => {
    expect(shortHash(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(shortHash(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(shortHash('')).toBe('');
  });

  it('truncates a 40-char commit hash to 7 characters', () => {
    expect(shortHash('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')).toBe('a1b2c3d');
  });

  it('returns the full string when it is shorter than 7 characters', () => {
    expect(shortHash('abc')).toBe('abc');
  });

  it('returns exactly 7 characters when given exactly 7', () => {
    expect(shortHash('1234567')).toBe('1234567');
  });
});

// ── relativeTime ───────────────────────────────────────────────────────────────

describe('relativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "never" for null', () => {
    expect(relativeTime(null)).toBe('never');
  });

  it('returns "never" for undefined', () => {
    expect(relativeTime(undefined)).toBe('never');
  });

  it('returns "never" for empty string', () => {
    expect(relativeTime('')).toBe('never');
  });

  it('returns "unknown" for an unparseable date string', () => {
    expect(relativeTime('not-a-date')).toBe('unknown');
  });

  it('returns "just now" for a date 30 seconds ago', () => {
    const now = new Date('2025-06-01T12:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 30_000).toISOString())).toBe('just now');
  });

  it('returns "Xm ago" for a date minutes ago', () => {
    const now = new Date('2025-06-01T12:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString())).toBe('5m ago');
  });

  it('returns "Xh ago" for a date hours ago', () => {
    const now = new Date('2025-06-01T12:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 3 * 3_600_000).toISOString())).toBe('3h ago');
  });

  it('returns "yesterday" for exactly 1 day ago', () => {
    const now = new Date('2025-06-01T12:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 24 * 3_600_000).toISOString())).toBe('yesterday');
  });

  it('returns "Xd ago" for several days ago', () => {
    const now = new Date('2025-06-01T12:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 10 * 86_400_000).toISOString())).toBe('10d ago');
  });

  it('returns "Xmo ago" for dates ~2 months ago', () => {
    const now = new Date('2025-06-01T12:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 60 * 86_400_000).toISOString())).toBe('2mo ago');
  });

  it('returns "Xy ago" for dates over a year ago', () => {
    const now = new Date('2025-06-01T12:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 730 * 86_400_000).toISOString())).toBe('2y ago');
  });

  it('parses SQLite datetime format (no T, no Z) without crashing', () => {
    const now = new Date('2025-06-01T12:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    // SQLite returns "YYYY-MM-DD HH:MM:SS" — normalised to UTC ISO inside relativeTime
    // 11:59:30 is 30 seconds before the mocked now (12:00:00), so "just now"
    const result = relativeTime('2025-06-01 11:59:30');
    expect(result).toBe('just now');
  });
});

// ── projectTimestampLabel ──────────────────────────────────────────────────────

describe('projectTimestampLabel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const now = new Date('2025-06-01T12:00:00Z').getTime();
  const recentIso = new Date(now - 30_000).toISOString(); // 30s ago → "just now"

  it('prefers scan.last_commit_date when available', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const label = projectTimestampLabel(
      { updated_at: recentIso, last_scanned_at: recentIso },
      { last_commit_date: recentIso },
    );
    expect(label).toBe('Commit just now');
  });

  it('falls back to last_scanned_at when no commit date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const label = projectTimestampLabel(
      { updated_at: recentIso, last_scanned_at: recentIso },
      { last_commit_date: null },
    );
    expect(label).toBe('Scanned just now');
  });

  it('falls back to updated_at when no scan date and no commit date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const label = projectTimestampLabel(
      { updated_at: recentIso, last_scanned_at: null },
    );
    expect(label).toBe('Updated just now');
  });

  it('falls back to updated_at when scan is null', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const label = projectTimestampLabel(
      { updated_at: recentIso, last_scanned_at: null },
      null,
    );
    expect(label).toBe('Updated just now');
  });
});
