import "server-only";

/**
 * YouTube search results for a query. Used to attach a recommended recipe
 * video plus a small set of alternatives to each meal — so the user has
 * a one-click choice instead of being thrown to a search results page.
 *
 * Cost: 100 units per search (free quota = 10,000 units/day). 7 meals/week
 * = 700 units/generation, well within budget. Asking for 5 results in one
 * search costs the same as asking for 1.
 */

export type RecipeVideo = {
  id: string;
  title: string;
  channel: string;
  url: string;
};

const YT_API = "https://www.googleapis.com/youtube/v3/search";
const DEFAULT_COUNT = 5;

/**
 * Fetch top N recipe videos for a query. First entry is the recommended
 * pick; the rest are alternatives shown alongside.
 */
export async function fetchRecipeVideos(
  apiKey: string,
  query: string,
  count: number = DEFAULT_COUNT,
): Promise<RecipeVideo[]> {
  if (!apiKey || !query) return [];
  const max = Math.min(Math.max(count, 1), 10);
  try {
    const url = `${YT_API}?part=snippet&type=video&maxResults=${max}&safeSearch=moderate&q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: { title?: string; channelTitle?: string };
      }>;
    };
    const out: RecipeVideo[] = [];
    for (const item of data.items ?? []) {
      const videoId = item.id?.videoId;
      if (!videoId) continue;
      out.push({
        id: videoId,
        title: item.snippet?.title ?? "Recipe video",
        channel: item.snippet?.channelTitle ?? "",
        url: `https://www.youtube.com/watch?v=${videoId}`,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Backwards-compatible single-result fetch. */
export async function fetchTopRecipeVideo(
  apiKey: string,
  query: string,
): Promise<RecipeVideo | null> {
  const list = await fetchRecipeVideos(apiKey, query, 1);
  return list[0] ?? null;
}

/** Validate a key by hitting a free endpoint. Returns true if 200. */
export async function testYouTubeKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${YT_API}?part=snippet&type=video&maxResults=1&q=test&key=${encodeURIComponent(apiKey)}`,
    );
    return res.ok;
  } catch {
    return false;
  }
}
