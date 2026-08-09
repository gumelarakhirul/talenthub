"use client";

import { useMemo, useState } from "react";
import DefaultLayout from "@/components/Layout/DefaultLayout";
import {
  computeInsightsFromPosts,
  filterPostsByRange,
  type RawPostLike,
} from "@/lib/insights";

type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const Users = ({ className }: IconProps) => <Icon className={className}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Icon>;
const Heart = ({ className }: IconProps) => <Icon className={className}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" /></Icon>;
const MessageCircle = ({ className }: IconProps) => <Icon className={className}><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.8 9.8 0 0 1-4.2-.9L3 21l1.9-4.8A8.4 8.4 0 1 1 21 11.5Z" /></Icon>;
const Eye = ({ className }: IconProps) => <Icon className={className}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Icon>;
const TrendingUp = ({ className }: IconProps) => <Icon className={className}><path d="m3 17 6-6 4 4 8-8" /><path d="M14 7h7v7" /></Icon>;
const Target = ({ className }: IconProps) => <Icon className={className}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></Icon>;
const ImageOff = ({ className }: IconProps) => <Icon className={className}><path d="m2 2 20 20M10.4 10.4a2 2 0 1 1 2.8 2.8M10.5 5H5a2 2 0 0 0-2 2v12c0 .6.2 1.1.6 1.4M21 15V7a2 2 0 0 0-2-2h-4M3 16l4-4 7 7M14 14l1-1 6 6" /></Icon>;

type Profile = {
  name: string;
  username: string;
  photoUrl: string | null;
  followers: number;
  following: number | null;
  socialMedia: string;
  totalPost: number;
  lastScrapedAt: string | null;
};

type Post = RawPostLike & { id: number };

type RangeDays = 7 | 30 | 60 | 90;

const RANGE_OPTIONS: { label: string; value: RangeDays }[] = [
  { label: "Last 7 Days", value: 7 },
  { label: "Last 30 Days", value: 30 },
  { label: "Last 60 Days", value: 60 },
  { label: "Last 90 Days", value: 90 },
];

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toString();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "numeric", year: "numeric" });
}

function proxied(url?: string | null): string {
  return url ? "/api/image-proxy?url=" + encodeURIComponent(url) : "";
}

// Outline-icon-in-a-box style, matching the step-indicator look
// (rounded square, border, icon centered, light tint background).
function MetricCard(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tint: string; // e.g. "text-rose-500"
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5">
      <div
        className={
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 " +
          props.tint
        }
      >
        {props.icon}
      </div>
      <div>
        <p className="text-xs font-medium tracking-wide text-slate-400">
          {props.label.toUpperCase()}
        </p>
        <p className="mt-1 text-xl font-bold text-slate-800">{props.value}</p>
      </div>
    </div>
  );
}

// Card shell filled with real hashtag/mention pills when data is available.
function TagListCard({
  title,
  items,
  variant,
  height = "h-40",
}: {
  title: string;
  items: string[];
  variant: "hashtag" | "mention";
  height?: string;
}) {
  const prefix = variant === "hashtag" ? "#" : "@";
  const pillClass =
    variant === "hashtag"
      ? "bg-indigo-50 text-indigo-600"
      : "bg-sky-50 text-sky-600";

  return (
    <div className={"flex flex-col rounded-xl border border-slate-200 p-4 " + height}>
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      <div className="mt-3 flex flex-1 flex-wrap items-start gap-2 overflow-y-auto">
        {items.length > 0 ? (
          items.map((item) => (
            <span
              key={item}
              className={"rounded-full px-3 py-1 text-xs font-medium " + pillClass}
            >
              {prefix}
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm italic text-slate-400">No data yet</span>
        )}
      </div>
    </div>
  );
}

// Bigger card for the content grid: large square thumbnail on top,
// likes/comments as caption underneath.
function PostCard({ post }: { post: Post }) {
  return (
    <a
      href={post.postUrl || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 transition hover:shadow-md"
    >
      <div className="aspect-square w-full overflow-hidden bg-slate-100">
        {post.thumbnailUrl ? (
          <img
            src={proxied(post.thumbnailUrl)}
            alt=""
            className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <ImageOff className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Heart className="h-4 w-4 text-rose-500" /> {formatNumber(post.likes)}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <MessageCircle className="h-4 w-4 text-emerald-500" /> {formatNumber(post.comments)}
        </p>
      </div>
    </a>
  );
}

export default function CreatorDetailClient(props: { profile: Profile; posts: Post[] }) {
  const { profile, posts } = props;
  const [range, setRange] = useState<RangeDays>(90);

  const defaultProfilePhoto = "/image/default-kol-avatar.png";
  const photoSrc = proxied(profile.photoUrl) || defaultProfilePhoto;
  const followingText = profile.following !== null ? formatNumber(profile.following) : "-";

  // Recomputed entirely client-side from the posts already fetched by the
  // server — clicking a range tab doesn't refetch or re-scrape anything.
  const insights = useMemo(() => {
    const filtered = filterPostsByRange(posts, range);
    return computeInsightsFromPosts(filtered, profile.followers, profile.totalPost);
  }, [posts, range, profile.followers, profile.totalPost]);

  const topPosts = useMemo(() => {
    return [...posts]
      .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
      .slice(0, 5);
  }, [posts]);

  return (
    <DefaultLayout>
      <div className="space-y-6">
        {/* Profile card */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="h-24 bg-[#E3A458]" />
          <div className="px-6 pb-6">
            <img
              src={photoSrc}
              alt={profile.name}
              onError={(event) => {
                if (!event.currentTarget.src.endsWith(defaultProfilePhoto)) {
                  event.currentTarget.src = defaultProfilePhoto;
                }
              }}
              className="-mt-10 h-20 w-20 rounded-2xl border-4 border-white object-cover"
            />
            <h1 className="mt-3 text-xl font-bold text-slate-800">{profile.name}</h1>
            <p className="text-sm text-slate-500">
              @{profile.username}{" "}
              <span className="text-xs uppercase text-slate-400">
                · {profile.socialMedia}
              </span>
            </p>

            <div className="mt-4 flex gap-6 text-sm">
              <span className="text-slate-400">
                FOLLOWERS{" "}
                <span className="font-bold text-slate-800">
                  {formatNumber(profile.followers)}
                </span>
              </span>
              <span className="text-slate-400">
                FOLLOWING{" "}
                <span className="font-bold text-slate-800">{followingText}</span>
              </span>
            </div>
          </div>
        </section>

        {/* User Performance */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold text-slate-800">User Performance</h2>

          <div className="mt-4 flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRange(opt.value)}
                className={
                  "rounded-full px-4 py-1.5 text-sm font-semibold " +
                  (range === opt.value
                    ? "bg-sky-600 text-white"
                    : "border border-slate-200 text-slate-500 hover:bg-slate-50")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                label="Total Posts"
                value={insights.totalPosts.toLocaleString("en-US")}
                tint="text-indigo-500"
                icon={<Users className="h-5 w-5" />}
              />
              <MetricCard
                label="Avg Likes"
                value={formatNumber(insights.avgLikes)}
                tint="text-rose-500"
                icon={<Heart className="h-5 w-5" />}
              />
              <MetricCard
                label="Avg Comments"
                value={formatNumber(insights.avgComments)}
                tint="text-emerald-500"
                icon={<MessageCircle className="h-5 w-5" />}
              />
              <MetricCard
                label="Avg Views"
                value={formatNumber(insights.avgViews)}
                tint="text-sky-500"
                icon={<Eye className="h-5 w-5" />}
              />
              <MetricCard
                label="Engagement Rate"
                value={insights.engagementRate.toFixed(2) + "%"}
                tint="text-teal-500"
                icon={<TrendingUp className="h-5 w-5" />}
              />
              <MetricCard
                label="Days Tracked"
                value={String(range)}
                tint="text-orange-500"
                icon={<Target className="h-5 w-5" />}
              />
            </div>
        </section>

        {/* Content — hashtags & mentions moved in here, full width so thumbnails can be bigger */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-8">
          <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold">
            📊 Content
          </h2>

          <div className="grid gap-6 xl:grid-cols-2">
            <TagListCard
              title={`Top ${insights.topHashtags.length} Hashtags`}
              items={insights.topHashtags.map((h) => h.tag)}
              variant="hashtag"
            />
            <TagListCard
              title={`Top ${insights.topMentions.length} Mentions`}
              items={insights.topMentions.map((m) => m.mention)}
              variant="mention"
            />
          </div>

          {profile.lastScrapedAt ? (
            <p className="mt-4 flex items-center gap-1 text-xs text-emerald-500">
              ✓ Last Updated: {formatDate(profile.lastScrapedAt)}
            </p>
          ) : null}

          <div className="mt-10">
            <h3 className="mb-5 text-xl font-bold">Top 5 Contents</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {topPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
              {topPosts.length === 0 ? (
                <p className="col-span-full py-8 text-center italic text-slate-400">
                  No posts available for this creator yet.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </DefaultLayout>
  );
}
