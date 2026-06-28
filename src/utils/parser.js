/**
 * Utils for parsing Gemini responses
 */

function parseGeminiJson(rawScript) {
  if (!rawScript || typeof rawScript !== 'string') return rawScript;

  try {
    // Attempt to clean markdown block formatting
    let cleanScript = rawScript.replace(/```(?:json)?\n?/gi, '').replace(/```\n?/g, '').trim();
    
    // Find the first '{' and the last '}' to extract raw JSON
    const startIdx = cleanScript.indexOf('{');
    const endIdx = cleanScript.lastIndexOf('}');
    
    if (startIdx !== -1 && endIdx !== -1) {
      cleanScript = cleanScript.substring(startIdx, endIdx + 1);
    }

    return JSON.parse(cleanScript);
  } catch (e) {
    // If parsing fails, return original string
    return rawScript;
  }
}

module.exports = {
  parseGeminiJson
};
