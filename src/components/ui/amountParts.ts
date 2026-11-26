/** Split piastres into display parts: sign, whole (grouped) and 2-digit fraction. */
export function amountParts(piastres: number) {
  const negative = piastres < 0;
  const abs = Math.abs(Math.round(piastres));
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  const fraction = (abs % 100).toString().padStart(2, '0');
  return { negative, whole, fraction };
}

