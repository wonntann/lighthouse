/**
 * @license Copyright 2016 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/* eslint-env mocha */

const FontsGatherer = require('../../../gather/gatherers/fonts');
const assert = require('assert');
let fontsGatherer;

const openSansFont = {
  display: 'auto',
  family: 'open Sans',
  stretch: 'normal',
  style: 'normal',
  weight: '400',
};
const openSansFontBold = {
  display: 'auto',
  family: 'open Sans',
  stretch: 'normal',
  style: 'normal',
  weight: '600',
};

const openSansFontFaces = [];
openSansFontFaces.push(Object.assign({},
  openSansFont,
  {
    src: [
      'https://fonts.gstatic.com/s/opensans/v15/u-WUoqrET9fUeobQW7jkRYX0hVgzZQUfRDuZrPvH3D8.woff2',
    ],
  }
));
openSansFontFaces.push(Object.assign({},
  openSansFontBold,
  {
    src: [
      'https://fonts.gstatic.com/s/opensans/v15/u-WUoqrET9fUeobQW7jkRYX0hVgzZQUfRDuZrPvH3D8.woff2',
    ],
  }
));

describe('Fonts gatherer', () => {
  // Reset the Gatherer before each test.
  beforeEach(() => {
    fontsGatherer = new FontsGatherer();
  });

  it('returns an artifact', () => {
    return fontsGatherer.afterPass({
      driver: {
        evaluateAsync: (code) => {
          if (code.includes('getAllLoadedFonts')) {
            return Promise.resolve([
              openSansFont,
            ]);
          } else {
            return Promise.resolve(openSansFontFaces);
          }
        },
      },
    }).then(artifact => {
      const expectedArtifact = Object.assign({},
        openSansFont,
        {
          src: ['https://fonts.gstatic.com/s/opensans/v15/u-WUoqrET9fUeobQW7jkRYX0hVgzZQUfRDuZrPvH3D8.woff2'],
        }
      );

      assert.equal(artifact.length, 1);
      assert.deepEqual(artifact[0], expectedArtifact);
    });
  });

  it('shouldn\'t break when no fonts are used', function() {
    return fontsGatherer.afterPass({
      driver: {
        evaluateAsync: (code) => {
          if (code.includes('getAllLoadedFonts')) {
            return Promise.resolve([]);
          } else {
            return Promise.resolve(openSansFontFaces);
          }
        },
      },
    }).then(artifact => {
      assert.ok(artifact);
    });
  });
});
