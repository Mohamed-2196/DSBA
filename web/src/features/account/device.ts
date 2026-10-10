// "Chrome on Windows" from a browser's user agent, for the list of signed-in devices.

export type DeviceKind = 'desktop' | 'phone' | 'tablet';

export interface Device {
  name: string;
  kind: DeviceKind;
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'Mac'],
  [/Linux/, 'Linux'],
];

export function describeDevice(userAgent: string | null | undefined): Device {
  const ua = userAgent ?? '';
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? null;
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? null;
  const kind: DeviceKind = /iPad|Tablet/.test(ua) ? 'tablet' : /Mobi|iPhone|Android/.test(ua) ? 'phone' : 'desktop';
  const name = browser && system ? `${browser} on ${system}` : browser || system || 'Unknown device';
  return { name, kind };
}
