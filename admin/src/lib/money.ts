// The API stores every amount as integer paise; the UI shows and accepts rupees.
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatInr = (paise: number): string => INR.format(paise / 100);

// "1,299.50" -> 129950. Returns null for anything that is not a non-negative amount with at most two decimals.
export function rupeesToPaise(value: string): number | null {
  const cleaned = value.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = "0", fraction = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export const paiseToRupees = (paise: number | null | undefined): string => (paise == null ? "" : (paise / 100).toFixed(2));

export const formatDate = (value: string | Date): string => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
