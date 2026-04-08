/** Heuristic extraction of a short summary from raw Claude output.
 *  Pure function — no side effects, no API calls.
 *  Returns an empty string if nothing useful can be extracted.
 */
export function generateSummaryHeuristic(raw: string): string {
  const text = raw.trim();
  if (!text) return '';

  const lines = text.split('\n');

  // 1. Look for an explicit summary/result line
  const SUMMARY_PREFIXES = [
    'summary:', 'result:', 'outcome:', 'key outcome:',
    'in summary', 'to summarize', 'in conclusion',
  ];
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase().trimStart();
    if (SUMMARY_PREFIXES.some((p) => lower.startsWith(p))) {
      // Take from this line to end of its paragraph
      const para = collectParagraph(lines, i);
      const cleaned = stripPrefix(para, SUMMARY_PREFIXES);
      if (cleaned.length > 10) return truncate(cleaned, 200);
    }
  }

  // 2. Fall back to first substantive paragraph (skip code blocks)
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('```')) { inCode = !inCode; continue; }
    if (inCode) continue;
    const para = collectParagraph(lines, i).trim();
    if (para.length > 20) return truncate(para, 200);
  }

  // 3. Last resort: first 200 chars
  return truncate(text, 200);
}

function collectParagraph(lines: string[], start: number): string {
  const result: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim() === '' && result.length > 0) break;
    result.push(lines[i]);
  }
  return result.join(' ').trim();
}

function stripPrefix(text: string, prefixes: string[]): string {
  const lower = text.toLowerCase();
  for (const p of prefixes) {
    if (lower.startsWith(p)) {
      return text.slice(p.length).replace(/^[:\s]+/, '').trim();
    }
  }
  return text;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}
