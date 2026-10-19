// Counts how often each word appears, case-insensitively.
export function wordFreq(text) {
  const counts = {};
  for (const w of text.split(" ")) {
    const key = w.toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export function topWords(text, n) {
  return Object.entries(wordFreq(text))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}
