// Motor parsare coduri de bare Cesar's — strict 17 cifre
// Format: [Articol(2)][Culoare(2)][Producător(2)][Flag(1)][Data DDMMYY(6)][Preț(4)]
// Total = 17 cifre numerice exacte

export const BARCODE_REGEX = /^\d{17}$/;

export interface ParsedBarcode {
  raw: string;
  articolCode: string;    // positions 0-1
  colorCode: string;      // positions 2-3
  producatorCode: string; // positions 4-5
  permanentFlag: string;  // position 6
  entryDate: Date | null;
  labelPrice: number;
  baseId: string;         // first 7 digits (articol+color+producator+flag)
  isValid: boolean;
  error?: string;
}

function parseDateDDMMYY(dateStr: string): Date | null {
  try {
    const day = parseInt(dateStr.substring(0, 2), 10);
    const month = parseInt(dateStr.substring(2, 4), 10) - 1;
    const year = 2000 + parseInt(dateStr.substring(4, 6), 10);
    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

export function isValidBarcode(barcode: string): boolean {
  return BARCODE_REGEX.test(barcode.trim());
}

export function parseBarcode(barcode: string): ParsedBarcode {
  const cleaned = barcode.trim();

  if (!BARCODE_REGEX.test(cleaned)) {
    return {
      raw: cleaned,
      articolCode: '', colorCode: '', producatorCode: '',
      permanentFlag: '', entryDate: null, labelPrice: 0,
      baseId: '', isValid: false,
      error: cleaned.length !== 17
        ? `Lungime invalidă: ${cleaned.length} cifre (trebuie exact 17)`
        : 'Codul de bare conține caractere non-numerice',
    };
  }

  const articolCode = cleaned.substring(0, 2);
  const colorCode = cleaned.substring(2, 4);
  const producatorCode = cleaned.substring(4, 6);
  const permanentFlag = cleaned.substring(6, 7);
  const dateStr = cleaned.substring(7, 13);
  const priceStr = cleaned.substring(13, 17);

  const baseId = cleaned.substring(0, 7);
  const entryDate = parseDateDDMMYY(dateStr);
  const labelPrice = parseInt(priceStr, 10);

  return {
    raw: cleaned,
    articolCode,
    colorCode,
    producatorCode,
    permanentFlag,
    entryDate,
    labelPrice,
    baseId,
    isValid: true,
  };
}

export function generateBarcode(
  articolCode: string,
  colorCode: string,
  producatorCode: string,
  permanentFlag: boolean,
  date: Date,
  price: number,
): string {
  const a = articolCode.padStart(2, '0').substring(0, 2);
  const c = colorCode.padStart(2, '0').substring(0, 2);
  const p = producatorCode.padStart(2, '0').substring(0, 2);
  const flag = permanentFlag ? '1' : '0';

  const dd = date.getDate().toString().padStart(2, '0');
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const yy = (date.getFullYear() % 100).toString().padStart(2, '0');
  const dateStr = `${dd}${mm}${yy}`;

  const priceStr = Math.min(9999, Math.max(0, Math.round(price))).toString().padStart(4, '0');

  return `${a}${c}${p}${flag}${dateStr}${priceStr}`;
}
