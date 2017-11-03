/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

import * as path from 'path';

import * as Printer from './printer';
import {Results} from './types/types';
import {Flags} from './cli-flags';
import {launch, LaunchedChrome} from 'chrome-launcher';

const yargsParser = require('yargs-parser');
const lighthouse = require('../lighthouse-core');
const log = require('lighthouse-logger');
const getFilenamePrefix = require('../lighthouse-core/lib/file-namer.js').getFilenamePrefix;
const assetSaver = require('../lighthouse-core/lib/asset-saver.js');

// accept noop modules for these, so the real dependency is optional.
import {opn} from './shim-modules';

const _RUNTIME_ERROR_CODE = 1;
const _PROTOCOL_TIMEOUT_EXIT_CODE = 67;

interface LighthouseError extends Error {
  code?: string
}

// exported for testing
export function parseChromeFlags(flags: string = '') {
  const parsed = yargsParser(
      flags, {configuration: {'camel-case-expansion': false, 'boolean-negation': false}});

  return Object
      .keys(parsed)
      // Remove unnecessary _ item provided by yargs,
      .filter(key => key !== '_')
      // Avoid '=true', then reintroduce quotes
      .map(key => {
        if (parsed[key] === true) return `--${key}`;
        return `--${key}="${parsed[key]}"`;
      });
}

/**
 * Attempts to connect to an instance of Chrome with an open remote-debugging
 * port. If none is found, launches a debuggable instance.
 */
async function getDebuggableChrome(flags: Flags) {
  return await launch({
    port: flags.port,
    chromeFlags: parseChromeFlags(flags.chromeFlags),
    logLevel: flags.logLevel
  });
}

function showConnectionError() {
  console.error('Unable to connect to Chrome');
  process.exit(_RUNTIME_ERROR_CODE);
}

function showRuntimeError(err: LighthouseError) {
  console.error('Runtime error encountered:', err);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(_RUNTIME_ERROR_CODE);
}

function showProtocolTimeoutError() {
  console.error('Debugger protocol timed out while connecting to Chrome.');
  process.exit(_PROTOCOL_TIMEOUT_EXIT_CODE);
}

function showPageLoadError() {
  console.error('Unable to load the page. Please verify the url you are trying to review.');
  process.exit(_RUNTIME_ERROR_CODE);
}

function handleError(err: LighthouseError) {
  if (err.code === 'PAGE_LOAD_ERROR') {
    showPageLoadError();
  } else if (err.code === 'ECONNREFUSED') {
    showConnectionError();
  } else if (err.code === 'CRI_TIMEOUT') {
    showProtocolTimeoutError();
  } else {
    showRuntimeError(err);
  }
}

export function saveResults(results: Results, artifacts: Object, flags: Flags) {
  let promise = Promise.resolve(results);
  const cwd = process.cwd();

  // If we ran in -G, then we have no report to save
  if (flags.gatherMode || !flags.auditMode) return promise;
  // Use the output path as the prefix for all generated files.
  // If no output path is set, generate a file prefix using the URL and date.
  const configuredPath = !flags.outputPath || flags.outputPath === 'stdout' ?
      getFilenamePrefix(results) :
      flags.outputPath.replace(/\.\w{2,4}$/, '');
  const resolvedPath = path.resolve(cwd, configuredPath);

  if (flags.saveArtifacts) {
    assetSaver.saveArtifacts(artifacts, resolvedPath);
  }

  if (flags.saveAssets) {
    promise = promise.then(_ => assetSaver.saveAssets(artifacts, results.audits, resolvedPath));
  }

  const typeToExtension = (type: string) => type === 'domhtml' ? 'html' : type;
  return promise.then(_ => {
    if (Array.isArray(flags.output)) {
      return flags.output.reduce((innerPromise, outputType) => {
        const outputPath = `${resolvedPath}.report.${typeToExtension(outputType)}`;
        return innerPromise.then((_: Results) => Printer.write(results, outputType, outputPath));
      }, Promise.resolve(results));
    } else {
      const outputPath =
          flags.outputPath || `${resolvedPath}.report.${typeToExtension(flags.output)}`;
      return Printer.write(results, flags.output, outputPath).then(results => {
        if (flags.output === Printer.OutputMode[Printer.OutputMode.html] ||
            flags.output === Printer.OutputMode[Printer.OutputMode.domhtml]) {
          if (flags.view) {
            opn(outputPath, {wait: false});
          } else {
            log.log(
                'CLI',
                'Protip: Run lighthouse with `--view` to immediately open the HTML report in your browser');
          }
        }

        return results;
      });
    }
  });
}

export async function runLighthouse(
    url: string, flags: Flags, config: Object|null): Promise<{}|void> {
  let launchedChrome: LaunchedChrome|undefined;

  const shouldGather = !flags.auditMode;

  try {
    if (shouldGather) {
      launchedChrome = await getDebuggableChrome(flags);
      flags.port = launchedChrome.port;
    }
    const results = await lighthouse(url, flags, config);

    const artifacts = results.artifacts;
    delete results.artifacts;
    await saveResults(results, artifacts!, flags);

    return results;
  } catch (err) {
    return handleError(err);
  } finally {
    if (typeof launchedChrome !== 'undefined') {
      await launchedChrome!.kill();
    }
  }
}
