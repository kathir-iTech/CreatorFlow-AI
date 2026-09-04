import { BaseProvider } from "../BaseProvider.js";
import type { DownloadPlan, DownloadRequest, MediaMetadata } from "../types.js";

export class InstagramProvider extends BaseProvider {
  readonly id = "instagram";
  readonly displayName = "Instagram";
  readonly domains = ["instagram.com", "instagr.am"];
  // Cookies are OPTIONAL — public reels/posts work without login.
  // If cookies.txt is present on the backend we still attach it (see
  // customizePlan) so login-gated reels also succeed.
  readonly requiresCookies = false;

  protected override customizePlan(
    plan: DownloadPlan,
    _metadata: MediaMetadata,
    _request: DownloadRequest,
  ): DownloadPlan {
    return {
      ...plan,
      referer: "https://www.instagram.com/",
      // Attach cookies.txt when available; yt-dlp silently ignores the
      // flag when the file doesn't exist, so public reels still work.
      useCookies: true,
    };
  }
}

export const instagramProvider = new InstagramProvider();