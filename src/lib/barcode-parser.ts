// Motor parsare coduri de bare Cesar's
// V1: 17 cifre = base_id(7) + date(6) + price(4)
// V2: 19 cifre = base_id(7) + variant(2) + date(6) + price(4)

export interface BarcodeConfig {
  dateFormat: 'DDMMYY' | 'YYMMDD';
  activeLengths: number[];
}

export interface ParsedBarcode {
  raw: string;
  version: 'V1' | 'V2';
  baseId: string;
  variantCode: string | null;
  entryDate: Date | null;
  labelPrice: number;
  isValid: boolean;
  error?: string;
}

const DEFAULT_CONFIG: BarcodeConfig = {
  dateFormat: 'DDMMYY',
  activeLengths: [17, 19],
};

function parseDate(dateStr: string, format: 'DDMMYY' | 'YYMMDD'): Date | null {
  try {
    let day: number, month: number, year: number;
    if (format === 'DDMMYY') {
      day = parseInt(dateStr.substring(0, 2), 10);
      month = parseInt(dateStr.substring(2, 4), 10) - 1;
      year = 2000 + parseInt(dateStr.substring(4, 6), 10);
    } else {
      year = 2000 + parseInt(dateStr.substring(0, 2), 10);
      month = parseInt(dateStr.substring(2, 4), 10) - 1;
      day = parseInt(dateStr.substring(4, 6), 10);
    }
    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

export function parseBarcode(
  barcode: string,
  config: BarcodeConfig = DEFAULT_CONFIG
): ParsedBarcode {
  const cleaned = barcode.trim();

  if (!/^\d+$/.test(cleaned)) {
    return {
      raw: cleaned, version: 'V1', baseId: '', variantCode: null,
      entryDate: null, labelPrice: 0, isValid: false,
      error: 'Codul de bare conține caractere non-numerice',
    };
  }

  if (!config.activeLengths.includes(cleaned.length)) {
    return {
      raw: cleaned, version: 'V1', baseId: '', variantCode: null,
      entryDate: null, labelPrice: 0, isValid: false,
      error: `Lungime invalidă: ${cleaned.length} cifre (așteptat: ${config.activeLengths.join(' sau ')})`,
    };
  }

  const isV2 = cleaned.length === 19;
  const version = isV2 ? 'V2' : 'V1';

  // Extract from right to left: price(4), date(6), then variant(2 for V2), rest = base_id
  const priceStr = cleaned.substring(cleaned.length - 4);
  const dateStr = cleaned.substring(cleaned.length - 10, cleaned.length - 4);
  const labelPrice = parseInt(priceStr, 10);

  let baseId: string;
  let variantCode: string | null = null;

  if (isV2) {
    variantCode = cleaned.substring(cleaned.length - 12, cleaned.length - 10);
    baseId = cleaned.substring(0, cleaned.length - 12);
  } else {
    baseId = cleaned.substring(0, cleaned.length - 10);
  }

  const entryDate = parseDate(dateStr, config.dateFormat);

  return {
    raw: cleaned,
    version,
    baseId,
    variantCode,
    entryDate,
    labelPrice,
    isValid: true,
  };
}

export function generateBarcode(
  baseId: string,
  variantCode: string | null,
  date: Date,
  price: number,
  config: BarcodeConfig = DEFAULT_CONFIG
): string {
  const priceStr = price.toString().padStart(4, '0');

  let dateStr: string;
  if (config.dateFormat === 'DDMMYY') {
    dateStr =
      date.getDate().toString().padStart(2, '0') +
      (date.getMonth() + 1).toString().padStart(2, '0') +
      (date.getFullYear() % 100).toString().padStart(2, '0');
  } else {
    dateStr =
      (date.getFullYear() % 100).toString().padStart(2, '0') +
      (date.getMonth() + 1).toString().padStart(2, '0') +
      date.getDate().toString().padStart(2, '0');
  }

  if (variantCode) {
    return baseId + variantCode + dateStr + priceStr;
  }
  return baseId + dateStr + priceStr;
}
