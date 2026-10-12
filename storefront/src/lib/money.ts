// The API stores every amount as integer paise.
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const formatInr = (paise: number): string => INR.format(paise / 100);

export const formatDate = (value: string | Date): string => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export const formatDateTime = (value: string | Date): string => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// Whole-rupee filter inputs <-> paise query values.
export const rupeesParam = (paise: string | undefined): string => (paise && /^\d+$/.test(paise) ? String(Math.round(Number(paise) / 100)) : "");
