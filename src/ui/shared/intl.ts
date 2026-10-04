import type { Locale } from '../../i18n';

/**
 * Shared Intl formatters, one per locale and options. Building a formatter is far slower than using one, and
 * a long log list formats several values per row. A date formatter keeps the time zone it was built in, so
 * the date formatters start over whenever the device's zone changes (a phone carried across zones).
 */
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();
let dateZone = '';

/**
 * The local UTC offsets in January and July of this year: they change when the time zone does. A cheap
 * probe — reading a new formatter's resolved zone would build a formatter on every call.
 */
function zoneProbe(): string {
  const year = new Date().getFullYear();
  return `${new Date(year, 0, 1).getTimezoneOffset()}/${new Date(year, 6, 1).getTimezoneOffset()}`;
}

export function dateTimeFormat(
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const zone = zoneProbe();
  if (zone !== dateZone) {
    dateFormats.clear();
    dateZone = zone;
  }
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format;
}

export function numberFormat(locale: Locale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format;
}
