import { tavily as Tavily } from '@tavily/core';
import dotenv from 'dotenv';
dotenv.config();

const tavily = Tavily({
    apiKey: process.env.TAVILY_API_KEY,
});

/**
 * Internet search tool — every Tavily search parameter is exposed so the
 * calling agent can decide how to search, not just what to search for.
 */
export const searchInternet = async ({
    query,                          // required — the search query string

    // --- core behavior ---
    searchDepth = "basic",          // "basic" | "advanced" — advanced = better relevance, costs 2 credits instead of 1
    topic = "general",              // "general" | "news" | "finance" — switches the underlying search agent
    maxResults = 5,                 // 0-20 — how many results to return

    // --- time filtering ---
    timeRange,                      // "day" | "week" | "month" | "year" (or "d"/"w"/"m"/"y") — how recent results must be
    startDate,                      // "YYYY-MM-DD" — only results after this date
    endDate,                        // "YYYY-MM-DD" — only results before this date

    // --- content shaping ---
    includeAnswer = false,          // false | true | "basic" | "advanced" — LLM-generated answer synthesized from results
    includeRawContent = false,      // false | true | "markdown" | "text" — full cleaned page content, not just snippet
    chunksPerSource,                // 1-5 — number of content chunks per source (advanced searchDepth only)

    // --- domain / region control ---
    includeDomains = [],            // string[] — restrict results to these domains (max 300)
    excludeDomains = [],            // string[] — exclude these domains (max 150)
    country,                        // string — boost results from a specific country (topic must be "general")

    // --- images ---
    includeImages = false,          // boolean — include query-related images
    includeImageDescriptions = false, // boolean — include LLM-generated descriptions for each image

    // --- precision ---
    exactMatch = false,             // boolean — only return results containing the exact quoted phrase(s) in query

    // --- misc ---
    includeFavicon = false,         // boolean — include favicon URL per result
    includeUsage = false,           // boolean — include API credit usage info in response
    timeout = 60,                   // number — request timeout in seconds
} = {}) => {
    try {
        const res = await tavily.search(query, {
            searchDepth,
            topic,
            maxResults,
            timeRange,
            startDate,
            endDate,
            includeAnswer,
            includeRawContent,
            chunksPerSource,
            includeDomains,
            excludeDomains,
            country,
            includeImages,
            includeImageDescriptions,
            exactMatch,
            includeFavicon,
            includeUsage,
            timeout,
        });

        return JSON.stringify(res);
    } catch (err) {
        return JSON.stringify({ error: true, message: err.message });
    }
};