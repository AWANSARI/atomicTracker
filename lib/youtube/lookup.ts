import "server-only";

/**
 * Top YouTube search result for a query. Used to attach a specific recipe
 * video to each meal at generate/swap time.
 *
 * Cost: 100 units per search (free quota = 10,000 units/day). 7 meals/week
 * = 700 units/generation, well within budget.
 */

export type RecipeVideo = {
  id: string;
  title: string;
  channel: string;
  url: string;
};

const YT_API = "https://www.googleapis.com/youtube/v3/search";

export async function fetchTopRecipeVideo(
  apiKey: string,
  query: string,
): Promise<RecipeVideo | null> {
  if (!apiKey || !query) return null;
  try {
    const url = `${YT_API}?part=snippet&type=video&maxResults=1&safeSearch=moderate&q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: { title?: string; channelTitle?: string };
      }>;
    };
    const item = data.items?.[0];
    const videoId = item?.id?.videoId;
    if (!videoId) return null;
    return {
      id: videoId,
      title: item.snippet?.title ?? "Recipe video",
      channel: item.snippet?.channelTitle ?? "",
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  } catch {
    return null;
  }
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
