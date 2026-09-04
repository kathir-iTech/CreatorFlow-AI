import { BaseProvider } from "../BaseProvider.js";
import type { DownloadPlan, DownloadRequest, MediaMetadata } from "../types.js";

export class FacebookProvider extends BaseProvider {
  readonly id = "facebook";
  readonly displayName = "Facebook";
  readonly domains = ["facebook.com", "fb.watch", "fb.com", "m.facebook.com"];
  readonly requiresCookies = true;

  protected override customizePlan(
    plan: DownloadPlan,
    _metadata: MediaMetadata,
    _request: DownloadRequest,
  ): DownloadPlan {
    return {
      ...plan,
      referer: "https://www.facebook.com/",
      useCookies: true,
    };
  }
}

export const facebookProvider = new FacebookProvider();