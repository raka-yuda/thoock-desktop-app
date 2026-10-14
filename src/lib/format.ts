export const date = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
export const bytes = (value: number) =>
  value < 1024 * 1024
    ? `${(value / 1024).toFixed(0)} KB`
    : value < 1024 ** 3
      ? `${(value / 1024 ** 2).toFixed(1)} MB`
      : `${(value / 1024 ** 3).toFixed(2)} GB`;
export const megapixels = (width: number, height: number) =>
  `${((width * height) / 1e6).toFixed(2)} MP`;
export const score = (demand: number, competition: number, fit: number) =>
  Math.floor((demand * 35 + (100 - competition) * 25 + fit * 40) / 100);
