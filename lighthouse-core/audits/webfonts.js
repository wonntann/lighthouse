/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Audit = require('./audit');
const Util = require('../report/v2/renderer/util');
const WebInspector = require('../lib/web-inspector');
const UnusedBytes = require('./byte-efficiency/byte-efficiency-audit');
const allowedFontFaceDisplays = ['optional', 'swap', 'fallback'];

class WebFonts extends Audit {
  /**
   * @return {!AuditMeta}
   */
  static get meta() {
    return {
      name: 'webfonts',
      description: 'uses font-display',
      failureDescription: 'Your fonts are blocking FCP!',
      helpText: 'You should use font-display!!!!',
      requiredArtifacts: ['traces', 'Fonts'],
    };
  }

  /**
   * @param {!Artifacts} artifacts
   * @return {!AuditResult}
   */
  static audit(artifacts) {
    const trace = artifacts.traces[this.DEFAULT_PASS];
    const devtoolsLogs = artifacts.devtoolsLogs[this.DEFAULT_PASS];
    const fontFaces = artifacts.Fonts;
    const traceOfTabPromise = artifacts.requestTraceOfTab(trace);
    const networkPromise = artifacts.requestNetworkRecords(devtoolsLogs);

    // Filter font-faces that do not have a display tag with optional or swap
    const fontsWithoutProperDisplay = fontFaces.filter(fontFace =>
      !fontFace.display || !allowedFontFaceDisplays.includes(fontFace.display)
    );


    return Promise.all([traceOfTabPromise, networkPromise]).then(([tabTrace, networkRecords]) => {
      let totalWasted = 0;
      const fcpInMS = tabTrace.timestamps.firstContentfulPaint / 1000;
      const results = networkRecords.filter(record => {
        const isFont = record._resourceType === WebInspector.resourceTypes.Font;
        //const isLoadedBeforeFCP = record._endTime * 1000 < fcpInMS;

        return isFont;// && isLoadedBeforeFCP;
      })
        .filter(fontRecord => {
          // find the fontRecord of a font
          return !!fontsWithoutProperDisplay.find(fontFace => fontFace.src.find(src => fontRecord.url === src));
        })
        // calculate wasted time
        .map(record => {
          const wastedTime = (record._endTime * 1000 - tabTrace.timestamps.navigationStart / 1000);
          totalWasted += wastedTime;

          return {
            url: record.url,
            wastedTime: Util.formatMilliseconds(wastedTime, 1),
          };
        });

      const headings = [
        { key: 'url', itemType: 'url', text: 'Font URL' },
        { key: 'wastedTime', itemType: 'text', text: 'Time it took' },
      ];
      const details = Audit.makeTableDetails(headings, results);

      return {
        score: UnusedBytes.scoreForWastedMs(totalWasted),
        rawValue: totalWasted,
        displayValue: Util.formatMilliseconds(totalWasted, 1),
        extendedInfo: {
          value: {
            wastedMs: totalWasted,
          },
        },
        details,
      };
    });
  }
}

module.exports = WebFonts;
