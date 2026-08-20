import type { SocialPlatform } from './social-platform';
import { contentIdentityMatches, getContentIdentity } from './content-url';
import { withApifyClient } from './apify-token-pool';

export interface RawPost {
  caption: string;
  likes: number;
  comments: number;
  views?: number;
  postedAt: string;
  postUrl: string;
  thumbnailUrl?: string;
}

export interface RawProfile {
  username: string;
  socialMedia: 'instagram' | 'tiktok';
  followers: number;
  following: number;
  totalPost: number;
  photoUrl?: string;
  photoUrls?: string[];
  bio?: string;
  posts: RawPost[];
  isValid: boolean;
}

export async function scrapeInstagramProfiles(usernames: string[], resultsLimit = 30): Promise<RawProfile[]> {
  return withApifyClient(async (client) => {
  const run = await client.actor('apify/instagram-scraper').call({
    directUrls: usernames.map(u => `https://www.instagram.com/${u}/`),
    resultsType: 'details',
    resultsLimit,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  return items.map((item: any) => {
    const photoUrls = imageUrls(
      item.profilePicUrlHD,
      item.profilePicUrl,
      item.profile_pic_url_hd,
      item.profile_pic_url,
    );

    return ({
    username: item.username,
    socialMedia: 'instagram' as const,
    followers: item.followersCount ?? 0,
    following: item.followsCount ?? 0,
    totalPost: item.postsCount ?? 0,
    photoUrl: photoUrls[0],
    photoUrls,
    bio: item.biography,
    posts: (item.latestPosts ?? []).map((p: any) => ({
      caption: p.caption ?? '',
      likes: p.likesCount ?? 0,
      comments: p.commentsCount ?? 0,
      views: p.videoViewCount,
      postedAt: p.timestamp,
      postUrl: p.url,
      thumbnailUrl: p.displayUrl,
    })),
    isValid: !item.error,
    });
  });
  });
}

export async function scrapeTiktokProfiles(usernames: string[], resultsPerPage = 30): Promise<RawProfile[]> {
  return withApifyClient(async (client) => {
  const run = await client.actor('clockworks/tiktok-scraper').call({
    profiles: usernames,
    resultsPerPage,
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
    const photoUrls = imageUrls(
      author.avatarLarger,
      author.avatarMedium,
      author.avatarThumb,
      author.avatar,
      author.avatarLargerUrl,
      author.avatarMediumUrl,
    );
    return {
      username,
      socialMedia: 'tiktok' as const,
      followers: author.fans ?? 0,
      following: author.following ?? 0,
      totalPost: author.video ?? 0,
      photoUrl: photoUrls[0],
      photoUrls,
      bio: author.signature,
      posts: posts.map((p: any) => ({
        caption: p.text ?? '',
        likes: p.diggCount ?? 0,
        comments: p.commentCount ?? 0,
        views: p.playCount,
        postedAt: p.createTimeISO,
        postUrl: p.webVideoUrl,
        thumbnailUrl: p.videoMeta?.coverUrl ?? p.videoMeta?.originalCoverUrl,
      })),
      isValid: true,
    };
  });
  });
}

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

export interface ContentMetrics {
  contentUrl: string;
  scrapedContentUrl: string;
  contentId: string;
  platform: SocialPlatform;
  caption: string;
  thumbnailUrl?: string;
  thumbnailCandidates?: string[];
  likes: number;
  comments: number;
  saves: number;
  reposts: number;
  views: number;
  plays: number;
  duration: number;
  shares: number;
}

function int(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function imageUrls(...values: unknown[]): string[] {
  const result: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value)) result.push(value);
      return;
    }
    if (Array.isArray(value)) return value.forEach(visit);
    if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  values.forEach(visit);
  return [...new Set(result)];
}

function returnedContentUrl(item: Record<string, unknown>, platform: SocialPlatform): string | null {
  const text = (...keys: string[]) => {
    const value = keys.map((key) => item[key]).find((candidate) => typeof candidate === 'string' || typeof candidate === 'number');
    return value === undefined ? null : String(value);
  };
  const candidates = platform === 'instagram'
    ? [
        // Input/permalink and shortcode identify the post. A generic `url`
        // from Instagram actors may point to the author profile or CDN.
        text('inputUrl'), text('postUrl'), text('permalink'),
        text('shortcode', 'code') ? `https://instagram.com/reel/${text('shortcode', 'code')}/` : null,
        text('url'),
      ]
    : platform === 'tiktok'
      ? [text('inputUrl'), text('postUrl'), text('webVideoUrl'), text('id', 'aweme_id') ? `https://tiktok.com/@unknown/video/${text('id', 'aweme_id')}/` : null, text('url')]
      : platform === 'youtube'
        ? [text('inputUrl'), text('videoUrl'), text('id', 'videoId') ? `https://youtube.com/watch?v=${text('id', 'videoId')}` : null, text('url')]
        : [text('inputUrl'), text('tweetUrl'), text('id', 'tweetId') ? `https://x.com/i/status/${text('id', 'tweetId')}/` : null, text('url')];
  return candidates.find((candidate): candidate is string => typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) ?? null;
}

async function resolveShortUrl(value: string): Promise<string> {
  const identity = getContentIdentity(value);
  if (!identity.isShortUrl) return identity.normalizedUrl;
  try {
    const response = await fetch(identity.normalizedUrl, {
      method: 'HEAD', redirect: 'follow', cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    return response.url || identity.normalizedUrl;
  } catch {
    return identity.normalizedUrl;
  }
}

export async function scrapeContentUrl(value: string, expectedPlatform?: string | null): Promise<ContentMetrics> {
  const resolvedUrl = await resolveShortUrl(value);
  const requested = getContentIdentity(resolvedUrl, expectedPlatform);
  const contentUrl = requested.normalizedUrl;
  const platform = requested.platform;
  return withApifyClient(async (client) => {
  // The general Instagram actor does not expose saves/reposts for a direct post.
  // This URL-specific actor returns those engagement fields and a stable thumbnail field.
  const run = platform === 'instagram'
    ? await client.actor('data-slayer/instagram-post-details').call({ urls: [contentUrl] })
    : platform === 'tiktok'
      ? await client.actor('clockworks/tiktok-scraper').call({
        postURLs: [contentUrl], scrapeRelatedVideos: false, resultsPerPage: 1,
        shouldDownloadCovers: true,
      })
      : platform === 'youtube'
        ? await client.actor('streamers/youtube-scraper').call({
          startUrls: [{ url: contentUrl }], maxResults: 1, maxResultsShorts: 1,
          maxResultStreams: 0, downloadSubtitles: false,
        })
        : await client.actor('scrapesage/twitter-scraper').call({
          tweetUrls: [contentUrl], includeProfile: false, includeTweets: true,
          includeReplies: false, maxTweetsPerProfile: 1,
        });
  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 10 });
  const actorItems = items as Record<string, any>[];
  // Prefer an exact actor result when its identity is available. Some actors,
  // especially Instagram post-details, return a media/CDN URL or a different
  // URL field even though the run was requested for one exact content URL.
  const matchingItem = actorItems.find((candidate) => {
    const candidateUrl = returnedContentUrl(candidate, platform);
    if (!candidateUrl) return false;
    try {
      return contentIdentityMatches(requested, getContentIdentity(candidateUrl, platform));
    } catch {
      return false;
    }
  });
  // URL-specific actors occasionally omit the permalink from their payload.
  // A single result is still tied to the one URL submitted to that actor. If a
  // returned identity is present, however, it must remain an exact match.
  const soleItemWithoutIdentity = actorItems.length === 1 && !returnedContentUrl(actorItems[0], platform)
    ? actorItems[0]
    : undefined;
  const item = matchingItem ?? soleItemWithoutIdentity;
  if (!actorItems[0]) throw new Error('Content could not be found or is not public');
  if (!item) {
    throw new Error('Scraper did not return the exact requested content');
  }
  if (item.error) throw new Error(String(item.error));
  const returnedUrl = returnedContentUrl(item, platform);
  const returned = returnedUrl ? getContentIdentity(returnedUrl, platform) : requested;
  if (returnedUrl && !contentIdentityMatches(requested, returned)) throw new Error('Scraper did not return the exact requested content');
  const verifiedContent = {
    scrapedContentUrl: returned.normalizedUrl,
    contentId: requested.contentId ?? returned.contentId ?? '',
  };

  if (platform === 'instagram') {
    const metrics = item.metrics ?? {};
    const caption = typeof item.caption === 'string'
      ? item.caption
      : item.caption?.text ?? item.caption?.text_translation ?? '';
    const plays = int(
      metrics.ig_play_count ?? metrics.play_count ?? item.play_count
      ?? item.plays_count ?? item.videoPlayCount
    );
    const thumbnailCandidates = imageUrls(
      item.thumbnail_url, item.thumbnailUrl, item.display_url, item.displayUrl,
      item.image_url, item.media_url, item.images, item.carousel_media,
      item.carouselMedia, item.childPosts,
    );
    return {
      contentUrl, ...verifiedContent, platform, caption,
      thumbnailUrl: thumbnailCandidates[0],
      thumbnailCandidates,
      likes: int(metrics.like_count ?? item.like_count ?? item.likesCount ?? item.likes_count),
      comments: int(metrics.comment_count ?? item.comment_count ?? item.commentsCount ?? item.comments_count),
      saves: int(metrics.save_count ?? item.save_count ?? item.saves_count ?? item.savesCount),
      reposts: int(metrics.repost_count ?? item.repost_count ?? item.reposts_count ?? item.repostsCount),
      views: int(metrics.view_count ?? metrics.ig_play_count ?? metrics.play_count
        ?? item.view_count ?? item.views_count ?? item.videoViewCount),
      plays,
      duration: Number(item.video_duration ?? item.videoDuration ?? item.duration) || 0,
      shares: int(metrics.share_count ?? item.share_count ?? item.shares_count ?? item.sharesCount),
    };
  }

  if (platform === 'tiktok') {
    const thumbnailCandidates = imageUrls(
    item.videoMeta?.coverUrl, item.videoMeta?.originalCoverUrl,
    item.videoMeta?.dynamicCoverUrl, item.video?.cover, item.video?.originCover,
    item.covers, item.cover, item.originCover, item.dynamicCover,
    item.downloadedCovers, item.downloadedCover,
  );
    return {
      contentUrl, ...verifiedContent, platform, caption: item.text ?? item.desc ?? '',
      thumbnailUrl: thumbnailCandidates[0], thumbnailCandidates,
      likes: int(item.diggCount ?? item.digg_count ?? item.stats?.diggCount),
      comments: int(item.commentCount ?? item.comment_count ?? item.stats?.commentCount),
      saves: int(item.collectCount ?? item.collect_count ?? item.stats?.collectCount),
      reposts: int(item.repostCount ?? item.repost_count ?? item.stats?.repostCount),
      views: int(item.playCount ?? item.play_count ?? item.stats?.playCount),
      plays: int(item.playCount ?? item.play_count ?? item.stats?.playCount),
      duration: Number(item.videoMeta?.duration ?? item.video?.duration ?? item.duration) || 0,
      shares: int(item.shareCount ?? item.share_count ?? item.stats?.shareCount),
    };
  }

  if (platform === 'youtube') {
    const thumbnailCandidates = imageUrls(
      item.thumbnailUrl, item.thumbnail, item.thumbnails, item.videoThumbnails,
      item.bestThumbnail, item.channelThumbnailUrl,
    );
    const views = int(item.viewCount ?? item.views ?? item.viewsCount ?? item.stats?.views);
    return {
      contentUrl, ...verifiedContent, platform,
      caption: item.title ?? item.text ?? item.description ?? '',
      thumbnailUrl: thumbnailCandidates[0], thumbnailCandidates,
      likes: int(item.likes ?? item.likeCount ?? item.likesCount),
      comments: int(item.commentsCount ?? item.commentCount ?? item.comments),
      saves: 0, reposts: 0, views, plays: views,
      duration: Number(item.duration ?? item.durationSeconds ?? item.lengthSeconds) || 0,
      shares: 0,
    };
  }

  const metrics = item.metrics ?? item.public_metrics ?? item.stats ?? {};
  const thumbnailCandidates = imageUrls(
    item.thumbnailUrl, item.thumbnail, item.media, item.extendedEntities,
    item.entities?.media, item.card?.image, item.authorProfile?.profileImageUrl,
  );
  const views = int(metrics.viewCount ?? metrics.views ?? item.viewCount ?? item.views);
  return {
    contentUrl, ...verifiedContent, platform,
    caption: item.text ?? item.fullText ?? item.full_text ?? item.tweet ?? '',
    thumbnailUrl: thumbnailCandidates[0], thumbnailCandidates,
    likes: int(metrics.likeCount ?? metrics.likes ?? item.likeCount ?? item.favoriteCount),
    comments: int(metrics.replyCount ?? metrics.replies ?? item.replyCount),
    saves: int(metrics.bookmarkCount ?? metrics.bookmarks ?? item.bookmarkCount),
    reposts: int(metrics.retweetCount ?? metrics.reposts ?? item.retweetCount),
    views, plays: views,
    duration: Number(item.duration ?? item.video?.duration ?? item.media?.[0]?.duration) || 0,
    shares: int(metrics.quoteCount ?? metrics.quotes ?? item.quoteCount),
  };
  });
}
