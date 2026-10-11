import { randomBytes } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { logger } from "../logger.js";

/**
 * Puts a rendered report somewhere a phone browser can open it.
 * Telegram's in-app document preview (iOS QuickLook) does not run JavaScript, so a report sent
 * only as a file loses sorting and filters on mobile. A link opens in the real browser.
 */
export interface ReportPublisher {
  /** Returns a public URL, or null when publishing failed (the caller still sends the file). */
  publish(html: string): Promise<string | null>;
}

/** Days a report link stays valid; matches the bucket lifecycle rule in Terraform. */
export const REPORT_TTL_DAYS = 30;

/**
 * Private S3 bucket behind CloudFront (origin access control). Keys are 128 random bits, so a link
 * cannot be guessed; the bucket lifecycle deletes reports after REPORT_TTL_DAYS.
 */
export function createS3Publisher(opts: { bucket: string; baseUrl: string; region: string }): ReportPublisher {
  const s3 = new S3Client({ region: opts.region });
  const base = opts.baseUrl.replace(/\/+$/, "");
  return {
    async publish(html) {
      const key = `reports/${randomBytes(16).toString("hex")}.html`;
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: opts.bucket,
            Key: key,
            Body: html,
            ContentType: "text/html; charset=utf-8",
            CacheControl: "private, max-age=86400",
          }),
        );
        return `${base}/${key}`;
      } catch (e) {
        logger.warn("report publish failed", { err: (e as Error).message });
        return null;
      }
    },
  };
}
