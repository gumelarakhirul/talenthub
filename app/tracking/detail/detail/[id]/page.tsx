import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import CreatorDetailClient from "./CreatorDetailClient";

const prisma = new PrismaClient();

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const creatorId = Number(id);
  if (isNaN(creatorId)) return notFound();

  const creator = await prisma.mst_creators.findUnique({
    where: { id: creatorId },
  });

  if (!creator) return notFound();

  // Fetch ALL scraped posts (not just top 5) — the client needs caption +
  // postedAt on every post to recompute avg likes/comments/views,
  // engagement rate, top hashtags, and top mentions per date-range tab
  // (Last 7/30/60/90 Days), exactly like the New Discovery page does.
  const allPosts = await prisma.dtl_creator_posts.findMany({
    where: { creator_id: creatorId },
    orderBy: { posted_at: "desc" },
    select: {
      id: true,
      post_url: true,
      thumbnail_url: true,
      caption: true,
      likes: true,
      comments: true,
      views: true,
      posted_at: true,
    },
  });

  return (
    <CreatorDetailClient
      profile={{
        name: creator.name,
        username: creator.username,
        photoUrl: creator.photo_url,
        followers: creator.followers ?? 0,
        following: creator.following ?? null,
        socialMedia: creator.social_media,
        totalPost: creator.total_post ?? 0,
        lastScrapedAt: creator.last_scraped_at
          ? creator.last_scraped_at.toISOString()
          : null,
      }}
      posts={allPosts.map((p) => ({
        id: p.id,
        postUrl: p.post_url ?? "",
        thumbnailUrl: p.thumbnail_url ?? undefined,
        caption: p.caption ?? "",
        likes: p.likes ?? 0,
        comments: p.comments ?? 0,
        views: p.views ?? 0,
        postedAt: p.posted_at ? p.posted_at.toISOString() : "",
      }))}
    />
  );
}