import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN! });

export interface RawPost {
  caption: string;
  likes: number;
  comments: number;
  views?: number;
  postedAt: string;
}

export interface RawProfile {
  username: string;
  socialMedia: 'instagram' | 'tiktok';
  followers: number;
  totalPost: number;
  photoUrl?: string;
  bio?: string;
  posts: RawPost[];
  isValid: boolean;
}

export async function scrapeInstagramProfiles(usernames: string[]): Promise<RawProfile[]> {
  const run = await client.actor('apify/instagram-scraper').call({
    directUrls: usernames.map(u => `https://www.instagram.com/${u}/`),
    resultsType: 'details',
    resultsLimit: 30,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  return items.map((item: any) => ({
    username: item.username,
    socialMedia: 'instagram' as const,
    followers: item.followersCount ?? 0,
    totalPost: item.postsCount ?? 0,
    photoUrl: item.profilePicUrl,
    bio: item.biography,
    posts: (item.latestPosts ?? []).map((p: any) => ({
      caption: p.caption ?? '',
      likes: p.likesCount ?? 0,
      comments: p.commentsCount ?? 0,
      views: p.videoViewCount,
      postedAt: p.timestamp,
    })),
    isValid: !item.error,
  }));
}

export async function scrapeTiktokProfiles(usernames: string[]): Promise<RawProfile[]> {
  const run = await client.actor('clockworks/tiktok-scraper').call({
    profiles: usernames,
    resultsPerPage: 30,
    shouldDownloadCovers: false,
    shouldDownloadVideos: false,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  const grouped = new Map<string, any[]>();
  for (const item of items as any[]) {
    const key = item.authorMeta?.name;
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  return Array.from(grouped.entries()).map(([username, posts]) => {
    const author = posts[0].authorMeta;
    return {
      username,
      socialMedia: 'tiktok' as const,
      followers: author.fans ?? 0,
      totalPost: author.video ?? 0,
      photoUrl: author.avatar,
      bio: author.signature,
      posts: posts.map((p: any) => ({
        caption: p.text ?? '',
        likes: p.diggCount ?? 0,
        comments: p.commentCount ?? 0,
        views: p.playCount,
        postedAt: p.createTimeISO,
      })),
      isValid: true,
    };
  });
}

// Validasi apakah username ada/valid, dipakai sebelum insert username baru temuan Gemini
export async function validateUsernames(
  usernames: string[],
  platform: 'instagram' | 'tiktok'
): Promise<{ username: string; valid: boolean }[]> {
  if (usernames.length === 0) return [];

  const profiles =
    platform === 'instagram'
      ? await scrapeInstagramProfiles(usernames)
      : await scrapeTiktokProfiles(usernames);

  const foundUsernames = new Set(
    profiles.filter(p => p.isValid).map(p => p.username.toLowerCase())
  );

  return usernames.map(u => ({
    username: u,
    valid: foundUsernames.has(u.toLowerCase()),
  }));
}