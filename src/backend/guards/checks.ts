export function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

export function isNonEmptyArray<T>(value: unknown): value is T[] {
    return Array.isArray(value) && value.length > 0;
}

export function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && !Array.isArray(value) && value !== null && Object.keys(value).length > 0;
}

export function isNonEmptyNumber(value: unknown): value is number {
    return typeof value === "number" && !Number.isNaN(value) && value > 0;
}

export function isInRecord<K extends string, V>(value: unknown, record: Record<K, V>): value is V {
    return typeof value === "string" && value in record;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
export function parseFiniteInteger(value: unknown, fieldName: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${fieldName} must be a finite number`);
    }

    return Math.round(value);
}

