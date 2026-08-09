const MAX_PROFILE_IMAGE_BYTES = 1_500_000;

export async function persistProfileImage(sourceUrl?: string | null): Promise<string | null> {
  const url = String(sourceUrl ?? "").trim();
  if (!url) return null;
  if (url.startsWith("data:image/") || url.startsWith("/")) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  } catch {
    return null;
  }

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: parsed.hostname.includes("tiktok")
          ? "https://www.tiktok.com/"
          : "https://www.instagram.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
      },
    });
    if (!response.ok) return url;

    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!contentType?.startsWith("image/")) return url;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_PROFILE_IMAGE_BYTES) return url;
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return url;
  }
}
