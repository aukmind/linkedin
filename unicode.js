// Start codepoints for each Unicode letter block (A..Z then a..z, 26+26 = 52 chars).
const LETTER_BLOCKS = {
  bold:                     0x1d400,
  italic:                   0x1d434,
  "bold-italic":            0x1d468,
  script:                   0x1d4d0,
  "sans-serif":             0x1d5a0,
  "sans-serif-bold":        0x1d5d4,
  "sans-serif-italic":      0x1d608,
  "sans-serif-bold-italic": 0x1d63c,
};

// Start codepoints for digit blocks (0..9, 10 chars).
const DIGIT_BLOCKS = {
  bold:        0x1d7ce,
  sans:        0x1d7e2,
  "sans-bold": 0x1d7ec,
};

// Math italic 'h' is reserved at U+1D455; the actual italic h lives at U+210E.
const RESERVED_FALLBACKS = { 0x1d455: 0x210e };
const FALLBACK_REVERSE = { 0x210e: "h" };

function letterBlockKey({ isBold, isItalic, isScript, isSans }) {
  if (isScript) return "script";
  const parts = [];
  if (isSans) parts.push("sans-serif");
  if (isBold) parts.push("bold");
  if (isItalic) parts.push("italic");
  return parts.join("-");
}

function digitBlockKey({ isBold, isItalic, isScript, isSans }) {
  if (isSans) return (isBold || isItalic) ? "sans-bold" : "sans";
  if (isBold || isItalic || isScript) return "bold";
  return null;
}

function convert(text, state) {
  const letterStart = LETTER_BLOCKS[letterBlockKey(state)];
  const digitStart = DIGIT_BLOCKS[digitBlockKey(state)];
  if (letterStart === undefined && digitStart === undefined) return text;

  let result = "";
  for (const char of text) {
    const code = char.codePointAt(0);

    if (digitStart !== undefined && code >= 48 && code <= 57) {
      result += String.fromCodePoint(digitStart + (code - 48));
      continue;
    }

    if (letterStart !== undefined) {
      let offset;
      if (code >= 65 && code <= 90) offset = code - 65;
      else if (code >= 97 && code <= 122) offset = code - 97 + 26;
      else { result += char; continue; }
      const target = letterStart + offset;
      result += String.fromCodePoint(RESERVED_FALLBACKS[target] ?? target);
      continue;
    }

    result += char;
  }
  return result;
}

function normalize(text) {
  let result = "";
  for (const char of text) {
    const code = char.codePointAt(0);
    if (FALLBACK_REVERSE[code]) { result += FALLBACK_REVERSE[code]; continue; }

    let mapped = char;
    for (const start of Object.values(LETTER_BLOCKS)) {
      if (code >= start && code < start + 52) {
        const offset = code - start;
        mapped = String.fromCodePoint((offset < 26 ? 65 : 97 - 26) + offset);
        break;
      }
    }
    if (mapped === char) {
      for (const start of Object.values(DIGIT_BLOCKS)) {
        if (code >= start && code < start + 10) {
          mapped = String.fromCodePoint(48 + (code - start));
          break;
        }
      }
    }
    result += mapped;
  }
  return result;
}

function getFormattingState(text) {
  const state = { isBold: false, isItalic: false, isScript: false, isSans: false };
  if (!text) return state;

  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === 0x210e) { state.isItalic = true; return state; }

    for (const [key, start] of Object.entries(LETTER_BLOCKS)) {
      if (code >= start && code < start + 52) {
        state.isBold = key.includes("bold");
        state.isItalic = key.includes("italic");
        state.isScript = key === "script";
        state.isSans = key.includes("sans");
        return state;
      }
    }

    for (const [key, start] of Object.entries(DIGIT_BLOCKS)) {
      if (code >= start && code < start + 10) {
        state.isBold = key.includes("bold");
        state.isSans = key.includes("sans");
        return state;
      }
    }
  }
  return state;
}
