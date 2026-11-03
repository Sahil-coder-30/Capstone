/** Reads ?page and ?limit with safe bounds (limit 1..100, default 20). */
export function parsePaging(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    return { page, limit };
}
