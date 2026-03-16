/** Format an ISO date string as a human-readable relative time. */
export function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'never';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'unknown';

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 30) return `${diffDay}d ago`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}mo ago`;
  return `${Math.floor(diffDay / 365)}y ago`;
}

/** Shorten a commit hash to 7 characters. */
export function shortHash(hash: string | null | undefined): string {
  if (!hash) return '';
  return hash.slice(0, 7);
}

/**
 * Download a string as a JSON file.
 * Uses a data: URI so it works reliably in Tauri's WKWebView without
 * needing a custom download handler (blob: URL clicks are unreliable there).
 */
export function downloadJson(content: string, filename: string): void {
  const a = document.createElement('a');
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(content);
  a.download = filename;
  // Must be in the DOM for WebKit to honour the download attribute
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Open a native file picker and read the selected JSON file.
 * Appends the input to the DOM before clicking — required for WKWebView
 * to fire the change event.
 */
export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

export function savePref<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function readJsonFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    // Must be in DOM (even if invisible) for WKWebView to open the picker
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = () => {
      document.body.removeChild(input);
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };

    // If the picker is dismissed without choosing a file, clean up
    input.oncancel = () => {
      document.body.removeChild(input);
      reject(new Error('No file selected'));
    };

    input.click();
  });
}
