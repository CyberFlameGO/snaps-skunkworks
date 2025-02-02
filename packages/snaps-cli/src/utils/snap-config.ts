import { readFileSync } from 'fs';
import { Arguments } from 'yargs';
import yargsParse from 'yargs-parser';
import yargs from 'yargs/yargs';
import builders from '../builders';
import { logError } from './misc';
import { CONFIG_FILE } from '.';

// Note that the below function is necessary because yarg's .config() function
// leaves much to be desired.
//
// In particular, it will set all properties included in the config file
// regardless of the command, which fails during validation.

/**
 * Attempts to read configuration options for package.json and the config file,
 * and apply them to argv if they weren't already set.
 *
 * Arguments are only set per the snap-cli config file if they were not specified
 * on the command line.
 */
export function applyConfig(
  processArgv: string[],
  yargsArgv: Arguments,
  yargsInstance: typeof yargs,
): void {
  // Instances of yargs has a number of undocumented functions, including
  // getOptions. This function returns an object with properties "key" and
  // "alias", which specify the options associated with the current command and
  // their aliases, respectively.
  //
  // We leverage this to ensure that the config is only applied to args that are
  // valid for the current command, and that weren't specified by the user on
  // the command line.
  //
  // If we set args that aren't valid for the current command, yargs will error
  // during validation.
  const { alias: aliases, key: options } = (
    yargsInstance as any
  ).getOptions() as {
    alias: Record<string, string[]>;
    key: Record<string, unknown>;
  };

  const parsedProcessArgv = yargsParse(processArgv, {
    alias: aliases,
  }) as Record<string, unknown>;
  delete parsedProcessArgv._; // irrelevant yargs parser artifact

  const commandOptions = new Set(Object.keys(options));

  const shouldSetArg = (key: string): boolean => {
    return (
      commandOptions.has(key) &&
      !Object.prototype.hasOwnProperty.call(parsedProcessArgv, key)
    );
  };

  // Now, we attempt to read and apply config from the config file, if any.
  let cfg: Record<string, unknown> = {};
  try {
    cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      // If there's no config file, we're done here.
      return;
    }

    logError(
      `Error: "${CONFIG_FILE}" exists but could not be parsed. Ensure your config file is valid JSON and try again.`,
      err,
    );
    process.exit(1);
  }

  if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
    for (const key of Object.keys(cfg)) {
      if (Object.hasOwnProperty.call(builders, key)) {
        if (shouldSetArg(key)) {
          yargsArgv[key] = cfg[key];
        }
      } else {
        logError(
          `Error: Encountered unrecognized config property "${key}" in config file "${CONFIG_FILE}". Remove the property and try again.`,
        );
        process.exit(1);
      }
    }
  } else {
    const cfgType = cfg === null ? 'null' : typeof cfg;

    logError(
      `Error: The config file must consist of a top-level JSON object. Received "${cfgType}" from "${CONFIG_FILE}". Fix your config file and try again.`,
    );
    process.exit(1);
  }
}
