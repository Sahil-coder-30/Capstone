import { BadRequestError } from 'faultkit';

/** Reads an optional date query param. A value that is not a date is a 400, not a database error. */
export function parseDateParam(value, name) {
    if (value === undefined || value === '') return undefined;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new BadRequestError(`${name} must be a date`);
    return date.toISOString();
}

/** Reads ?page and ?limit with safe bounds (limit 1..100, default 20). */
export function parsePaging(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    return { page, limit };
}
