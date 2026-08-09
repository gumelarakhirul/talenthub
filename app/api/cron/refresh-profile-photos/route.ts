import { scrapeInstagramProfiles, scrapeTiktokProfiles, type RawProfile } from "@/lib/apify";
import { firstProfileImageUrl } from "@/lib/profile-image";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_SIZE = 25;

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

async function scrapeProfiles(platform: string, usernames: string[]): Promise<RawProfile[]> {
  if (platform === "instagram") return scrapeInstagramProfiles(usernames, usernames.length);
  if (platform === "tiktok") return scrapeTiktokProfiles(usernames, 1);
  return [];
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creators = await prisma.mst_creators.findMany({
    where: { social_media: { in: ["instagram", "tiktok"], mode: "insensitive" } },
    select: { id: true, username: true, social_media: true },
    orderBy: { id: "asc" },
  });

  let updated = 0;
  const failures: Array<{ platform: string; usernames: string[]; reason: string }> = [];

  for (const platform of ["instagram", "tiktok"] as const) {
    const platformCreators = creators.filter(
      (creator) => creator.social_media.trim().toLowerCase() === platform,
    );

    for (const batch of chunks(platformCreators, BATCH_SIZE)) {
      try {
        const profiles = await scrapeProfiles(
          platform,
          batch.map((creator) => normalizeUsername(creator.username)),
        );
        const profileLookup = new Map(
          profiles.map((profile) => [normalizeUsername(profile.username), profile]),
        );
        const updates = batch.flatMap((creator) => {
          const profile = profileLookup.get(normalizeUsername(creator.username));
          const photoUrl = profile?.isValid
            ? firstProfileImageUrl([...(profile.photoUrls ?? []), profile.photoUrl])
            : null;
          return photoUrl ? [{ id: creator.id, photoUrl }] : [];
        });

        if (updates.length) {
          await prisma.$transaction(
            updates.map((item) => prisma.mst_creators.update({
              where: { id: item.id },
              data: {
                photo_url: item.photoUrl,
                last_scraped_at: new Date(),
                updated_at: new Date(),
              },
            })),
          );
          updated += updates.length;
        }
      } catch (error) {
        failures.push({
          platform,
          usernames: batch.map((creator) => creator.username),
          reason: error instanceof Error ? error.message : "Unknown scraper error",
        });
      }
    }
  }

  return NextResponse.json({
    total: creators.length,
    updated,
    failedBatches: failures.length,
    failures,
    refreshedAt: new Date().toISOString(),
  });
}
