const chunkText = (text, maxLength = 1000, overlap = 200) => {
  if (!text) return [];
  const chunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + maxLength;
    if (endIndex < text.length) {
      // Find the last space to avoid splitting words
      const lastSpace = text.lastIndexOf(' ', endIndex);
      if (lastSpace > startIndex) {
        endIndex = lastSpace;
      }
    } else {
      endIndex = text.length;
    }

    const chunk = text.slice(startIndex, endIndex).trim();
    if (chunk) chunks.push(chunk);

    // Advanced logic to prevent infinite loop
    const nextStart = endIndex - overlap;
    if (nextStart <= startIndex) {
      startIndex = endIndex; // No overlap if it would cause a loop
    } else {
      startIndex = nextStart;
    }

    if (startIndex >= text.length) break;
  }

  return chunks;
};

module.exports = { chunkText };
