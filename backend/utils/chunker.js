const chunkText = (text, wordCount = 350, overlapWords = 50) => {
  if (!text) return [];
  const words = text.trim().split(/\s+/);
  const chunks = [];
  
  for (let i = 0; i < words.length; i += (wordCount - overlapWords)) {
    const chunkWords = words.slice(i, i + wordCount);
    const chunk = chunkWords.join(' ');
    if (chunk) chunks.push(chunk);
    
    // Stop if we don't have enough words left for a new meaningful chunk
    if (i + wordCount >= words.length) break;
  }
  
  return chunks;
};

module.exports = { chunkText };
