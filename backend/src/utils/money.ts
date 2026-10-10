// Amounts are stored in major units (e.g. rupees) with at most two decimals.
// All arithmetic goes through minor units (paise) to avoid floating-point drift.

export function toMinor(amount: number): number {
    return Math.round(amount * 100);
}

export function fromMinor(minor: number): number {
    return minor / 100;
}

export function roundMoney(amount: number): number {
    return fromMinor(toMinor(amount));
}

export function sumMoney(amounts: number[]): number {
    return fromMinor(amounts.reduce((total, amount) => total + toMinor(amount), 0));
}

export function percentOf(amount: number, percent: number): number {
    return fromMinor(Math.round((toMinor(amount) * percent) / 100));
}

// Splits `total` across `weights` proportionally, in minor units, so the parts
// always add up to exactly `total`. Rounding leftovers go to the largest weights.
export function allocateProportionally(total: number, weights: number[]): number[] {
    const totalMinor = toMinor(total);
    const weightMinor = weights.map(toMinor);
    const weightSum = weightMinor.reduce((sum, weight) => sum + weight, 0);

    if (weights.length === 0) {
        return [];
    }
    if (weightSum === 0) {
        return allocateEvenly(total, weights.length);
    }

    const raw = weightMinor.map((weight) => (totalMinor * weight) / weightSum);
    const parts = raw.map(Math.floor);
    let remainder = totalMinor - parts.reduce((sum, part) => sum + part, 0);

    const order = raw
        .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
        .sort((a, b) => b.fraction - a.fraction || weightMinor[b.index]! - weightMinor[a.index]!);

    for (const { index } of order) {
        if (remainder <= 0) break;
        parts[index]! += 1;
        remainder -= 1;
    }

    return parts.map(fromMinor);
}

export function allocateEvenly(total: number, count: number): number[] {
    if (count <= 0) {
        return [];
    }
    const totalMinor = toMinor(total);
    const base = Math.floor(totalMinor / count);
    const remainder = totalMinor - base * count;
    return Array.from({ length: count }, (_, index) => fromMinor(base + (index < remainder ? 1 : 0)));
}
