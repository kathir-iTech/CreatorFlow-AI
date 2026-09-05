/**
 * SeoService — pure Groq chat-completion call: transcript in, titles /
 * description / tags / chapters out. It does NOT fetch transcripts (the
 * frontend supplies them from /captions) and does NOT touch yt-dlp, cookies,
 * or the filesystem — the only service with zero download-engine contact.
 */
import { env } from "@/config/env.js";
import { logger } from "@/logging/logger.js";
import { AppError } from "@/errors/AppError.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
// llama-3.3-70b-versatile was shut down 2026-08-16 (Groq deprecation);
// openai/gpt-oss-120b is Groq's recommended replacement. Overridable via env.
const MODEL = env.GROQ_SEO_MODEL?.trim() || "openai/gpt-oss-120b";

export interface SeoChapter {
  time: string;
  label: string;
}

export interface SeoResult {
  titles: string[];
  description: string;
  tags: string[];
  chapters: SeoChapter[];
}

const SYSTEM_PROMPT = `You are an expert YouTube SEO assistant. Given a video transcript, generate optimized YouTube metadata.

Respond with ONLY valid JSON matching this exact schema (no markdown, no code fences):
{
  "titles": ["title1", "title2", "title3", "title4", "title5"],
  "description": "...",
  "tags": ["tag1", "tag2", ...],
  "chapters": [{"time": "0:00", "label": "Intro"}, ...]
}

Rules:
- titles: exactly 5 variations, click-optimized, include target keywords
- description: 1-3 paragraphs, includes keywords naturally, ends with a call to action
- tags: 10-15 relevant search terms
- chapters: logical segments with timestamp (MM:SS format) and descriptive label
- All text must be plain — no markdown, no HTML, no emoji`;

function buildUserPrompt(transcript: string, videoTitle?: string): string {
  const maxLen = 8000;
  const truncated = transcript.length > maxLen ? transcript.slice(0, maxLen) + "..." : transcript;
  let prompt = `Transcript:\n${truncated}`;
  if (videoTitle) {
    prompt = `Video title: ${videoTitle}\n\n${prompt}`;
  }
  return prompt;
}

function parseSeoResponse(raw: string): SeoResult {
  // Strip potential markdown code fences
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  const parsed = JSON.parse(cleaned);
  if (
    !Array.isArray(parsed.titles) ||
    parsed.titles.length < 1 ||
    typeof parsed.description !== "string" ||
    !Array.isArray(parsed.tags) ||
    !Array.isArray(parsed.chapters)
  ) {
    throw new Error("Missing required fields in Groq response");
  }
  return {
    titles: parsed.titles.slice(0, 5),
    description: parsed.description,
    tags: parsed.tags.slice(0, 15),
    chapters: parsed.chapters.map((c: any) => ({
      time: String(c.time ?? ""),
      label: String(c.label ?? ""),
    })),
  };
}

export async function generateSeo(transcript: string, videoTitle?: string): Promise<SeoResult> {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AppError(
      "DOWNLOAD_FAILED",
      "GROQ_API_KEY is not configured — SEO generation requires a Groq API key.",
      503,
    );
  }

  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(transcript, videoTitle) },
          ],
          temperature: 0.7,
          max_tokens: 2048,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        logger.error(
          { status: res.status, model: MODEL, body: body.slice(0, 500) },
          "Groq SEO API error",
        );
        throw new AppError(
          "PROVIDER_ERROR",
          `Groq API returned ${res.status}: ${body.slice(0, 200) || "no detail"}`,
          502,
        );
      }

      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content) {
        throw new Error("Empty Groq response");
      }

      return parseSeoResponse(content);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (attempt < maxAttempts) {
        logger.warn({ attempt, error: String(err) }, "SEO parse failure, retrying");
        continue;
      }
      throw new AppError(
        "DOWNLOAD_FAILED",
        `SEO generation failed: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
  }

  throw new AppError("INTERNAL_ERROR", "SEO generation exhausted retries", 500);
}
