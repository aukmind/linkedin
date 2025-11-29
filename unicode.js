const CHARMAP_LENGTH = 52;
const CHARMAP_SPLIT = 26;

const DIGITMAP_LENGTH = 10;

class UnicodeMap {
  constructor(start, unicode, name, bold, italic, length = CHARMAP_LENGTH) {
    this.start = start;
    this.unicode = unicode;
    this.bold = bold;
    this.italic = italic;
    this.name = name;
    this.length = length;
  }
}

class Style {
  constructor(name, charmap, digitmap) {
    this.name = name;
    this.charmap = charmap;
    this.digitmap = digitmap;
  }
}

const DIGIMAPS = [
  new UnicodeMap("𝟎", 0x1d7ce, "Mathematical Bold", true, false, 10),
  new UnicodeMap("𝟢", 0x1d7e2, "Sans-Serif Regular", false, false, 10),
  new UnicodeMap("𝟬", 0x1d7ec, "Sans-Serif Bold", true, false, 10),
  new UnicodeMap("𝟶", 0x1d7f6, "Monospace Regular", false, false, 10),
];

const CHARMAPS = [
  new UnicodeMap("𝐀", 0x1d400, "Mathematical Bold", true, false),
  new UnicodeMap("𝐴", 0x1d434, "Mathematical Italic", false, true),
  new UnicodeMap("𝑨", 0x1d468, "Mathematical Italic bold", true, true),
  new UnicodeMap("𝓐", 0x1d4d0, "Script Bold", true, false),
  new UnicodeMap("𝕬", 0x1d56c, "Fractur Bold", true, false),
  new UnicodeMap("𝖠", 0x1d5a0, "Sans-Serif", false, false),
  new UnicodeMap("𝗔", 0x1d5d4, "Sans-Serif Bold", true, false),
  new UnicodeMap("𝘈", 0x1d608, "Sans-Serif Italic", false, true),
  new UnicodeMap("𝘼", 0x1d63c, "Sans-Seriff Italic Bold", true, true),
  new UnicodeMap("𝙰", 0x1d670, "Monospace Regular", false, false),
  new UnicodeMap("𝚨", 0x1d6a8, "Monospace Bold", true, false),
];

const STYLES = {
  bold: new Style("bold", CHARMAPS[0], DIGIMAPS[0]),
  italic: new Style("italic", CHARMAPS[1], DIGIMAPS[0]),
  "bold-italic": new Style("bold-italic", CHARMAPS[2], DIGIMAPS[0]),
  script: new Style("script", CHARMAPS[3], DIGIMAPS[0]),
  fraktur: new Style("fraktur", CHARMAPS[4], DIGIMAPS[0]),
  "sans-serif": new Style("sans-serif", CHARMAPS[5], DIGIMAPS[1]),
  "sans-serif-bold": new Style("sans-serif-bold", CHARMAPS[6], DIGIMAPS[2]),
  "sans-serif-italic": new Style("sans-serif-italic", CHARMAPS[7], DIGIMAPS[2]),
  "sans-serif-bold-italic": new Style(
    "sans-serif-bold-italic",
    CHARMAPS[8],
    DIGIMAPS[2]
  ),
  monospace: new Style("monospace", CHARMAPS[9], DIGIMAPS[3]),
  "monospace-bold": new Style("monospace", CHARMAPS[10], DIGIMAPS[3]),
};

function convert_to(text, styleName) {
  const style = STYLES[styleName];
  if (!style) {
    throw new Error(`Style "${styleName}" not found.`);
  }
  const charmap = style.charmap;
  const digitmap = style.digitmap;
  let result = "";

  for (const char of text) {
    const code = char.codePointAt(0);

    let offset = 0;
    if (code >= 65 && code <= 90) {
      // A-Z
      offset = code - 65;
    } else if (code >= 97 && code <= 122) {
      // a-z
      offset = code - 97 + CHARMAP_SPLIT;
    } else if (code >= 48 && code <= 57) {
      // 0-9
      if (digitmap === undefined) {
        result += char;
        continue;
      }
      offset = code - 48;
      result += String.fromCodePoint(digitmap.unicode + offset);
      continue;
    } else {
      result += char;
      continue;
    }

    if (charmap === undefined) {
      result += char;
      continue;
    }
    result += String.fromCodePoint(charmap.unicode + offset);
  }

  return result;
}

function normalize(text) {
  let result = "";
  for (const char of text) {
    const code = char.codePointAt(0);
    let converted = char;
    let found = false;

    for (const map of DIGIMAPS) {
      if (code >= map.unicode && code < map.unicode + map.length) {
        converted = String.fromCodePoint(48 + (code - map.unicode));
        found = true;
        break;
      }
    }

    if (!found) {
      for (const map of CHARMAPS) {
        if (code >= map.unicode && code < map.unicode + map.length) {
          const offset = code - map.unicode;
          if (offset < 26) {
            converted = String.fromCodePoint(65 + offset);
          } else {
            converted = String.fromCodePoint(97 + (offset - 26));
          }
          found = true;
          break;
        }
      }
    }
    result += converted;
  }
  return result;
}

function getFormattingState(text) {
  let state = {
    isBold: false,
    isItalic: false,
    isScript: false,
    isSans: false,
    isMono: false,
  };

  if (!text) return state;

  for (const char of text) {
    const code = char.codePointAt(0);

    for (const map of CHARMAPS) {
      if (code >= map.unicode && code < map.unicode + map.length) {
        if (map.bold) state.isBold = true;
        if (map.italic) state.isItalic = true;
        const name = map.name.toLowerCase();
        if (name.includes("script")) state.isScript = true;
        if (name.includes("sans")) state.isSans = true;
        if (name.includes("monospace")) state.isMono = true;
        return state; // Return on first styled char found
      }
    }

    for (const map of DIGIMAPS) {
      if (code >= map.unicode && code < map.unicode + map.length) {
        if (map.bold) state.isBold = true;
        const name = map.name.toLowerCase();
        if (name.includes("sans")) state.isSans = true;
        if (name.includes("monospace")) state.isMono = true;
        return state;
      }
    }
  }
  return state;
}

function hasUnicodeFormatting(text) {
  const normal = normalize(text);
  return normal !== text;
}
