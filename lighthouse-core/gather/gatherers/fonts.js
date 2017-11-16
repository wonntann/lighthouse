/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Gatherer = require('./gatherer');
const fontUrlRegex = new RegExp('url\\((?:"|\')([^"]+)(?:"|\')\\)');

/* eslint-disable */
function getAllLoadedFonts() {
  const getFont = fontFace => ({
    display: fontFace.display,
    family: fontFace.family,
    stretch: fontFace.stretch,
    style: fontFace.style,
    weight: fontFace.weight,
  });

  if (document.fonts.status === 'loaded') {
    return Promise.resolve(
      Array.from(document.fonts).filter(fontFace => fontFace.status === 'loaded')
        .map(getFont)
    );
  } else {
    return document.fonts.ready.then(() => {
      return Array.from(document.fonts).filter(fontFace => fontFace.status === 'loaded')
        .map(getFont);
    });
  }
}
function getFontFaceFromStylesheets() {
  const fontFaceRules = [];
  for (let sheet = 0; sheet < document.styleSheets.length; sheet++) {
    for (var i = 0; document.styleSheets[sheet].cssRules && i < document.styleSheets[sheet].cssRules.length; i++) {
      var rule = document.styleSheets[sheet].cssRules[i];

      if (rule instanceof CSSFontFaceRule) {
        const keys = Object.keys(rule.style);
        const fontObject = keys.reduce((fontRules, propName) => {
          if (!isNaN(propName)) {
            const cssKey = rule.style[keys[propName]];
            fontRules[cssKey.replace('font-', '')] = rule.style[cssKey];
          }

          return fontRules;
        }, {});

        fontFaceRules.push(fontObject);
      }
    }
  }

  return fontFaceRules;
}
/* eslint-enable */

class Fonts extends Gatherer {
  constructor() {
    super();

    this.stylesheetIds = [];
  }

  _onStyleSheetAdded({ header }) {
    this.stylesheetIds.push(header.styleSheetId);
    console.log('added', header.styleSheetId);
  }

  _onStyleSheetRemoved({ stylesheetId }) {
    this.stylesheetIds.splice(this.stylesheetIds.indexOf(stylesheetId), 1);
    console.log('removed', stylesheetId);
  }

  _findSameFontFamily(fontFace, fontFacesList) {
    return fontFacesList.find(fontItem => {
      return fontFace.family === fontItem.family &&
        fontFace.style === fontItem.style &&
        fontFace.weight === fontItem.weight
    });
  }

  afterPass({ driver }) {
    return Promise.all(
      [
        driver.evaluateAsync(`(${getAllLoadedFonts.toString()})()`),
        driver.evaluateAsync(`(${getFontFaceFromStylesheets.toString()})()`),
      ]
    ).then(([loadedFonts, fontFaces ]) => {
      return loadedFonts.map(fontFace => {
        const fontFaceItem = this._findSameFontFamily(fontFace, fontFaces);

        // if font-face hase an url
        if (fontFaceItem && fontFaceItem.src) {
          fontFace.src = [];

          // Fetch font urls and add them to the font-face
          fontFaceItem.src.split(',').forEach(src => {
            const matches = src.match(fontUrlRegex);
            if (matches) {
              fontFace.src.push(matches[1]);
            }
          });
        }

        return fontFace;
      });
    });
  }
}

module.exports = Fonts;
