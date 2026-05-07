import { dirname, resolve } from 'path';

export function getRootDir(): string {
  if (process.env.SCS_SITECORE_JSON) {
    return dirname(resolve(process.env.SCS_SITECORE_JSON));
  }
  return process.cwd();
}
