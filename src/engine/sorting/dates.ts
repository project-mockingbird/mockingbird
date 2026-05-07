/**
 * Parse Sitecore's `yyyyMMddTHHmmssZ` date string into epoch milliseconds.
 * Returns 0 for undefined, empty, or any value that doesn't match the strict
 * format. Used by the Created/Updated comparers; 0 sorts as "very old" /
 * "never updated" which mirrors Sitecore's `DateTime.MinValue` behavior at
 * `Sitecore.Kernel.decompiled.cs:CreatedComparer.GetCreationDate`.
 */
const SITECORE_DATE_REGEX = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

export function parseSitecoreDate(value: string | undefined): number {
  if (value === undefined || value === '') return 0;
  const m = SITECORE_DATE_REGEX.exec(value);
  if (!m) return 0;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const ms = Date.UTC(year, month, day, hour, minute, second);
  return Number.isNaN(ms) ? 0 : ms;
}
