import { tavily as Tavily } from "@tavily/core";

let client = null;

const getClient = () => {
  if (!process.env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY is not set");
  client ??= Tavily({ apiKey: process.env.TAVILY_API_KEY });
  return client;
};

/** Web search with a short synthesized answer plus the top sources. Throws on failure. */
export const searchInternet = async ({ query, maxResults = 5 }) => {
  const res = await getClient().search(query, {
    searchDepth: "basic",
    maxResults,
    includeAnswer: true,
    timeout: 30,
  });
  return {
    answer: res.answer || null,
    results: (res.results || []).map((r) => ({ title: r.title, url: r.url, content: r.content })),
  };
};
