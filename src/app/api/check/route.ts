import { z } from "zod";
import { hasModel, missingConfig } from "@/lib/nebius";
import { runCheck } from "@/lib/pipeline";
import type { CheckEvent } from "@/lib/types";

export const maxDuration = 300;

const Body = z
  .object({
    text: z.string().max(20_000).optional(),
    url: z.url().optional(),
    // The browser downscales screenshots before upload; this cap keeps requests under Vercel's 4.5 MB body limit.
    image: z
      .string()
      .max(4_000_000, "That screenshot is too large.")
      .regex(/^data:image\/(png|jpeg|webp);base64,/, "Screenshots must be PNG, JPEG or WebP.")
      .optional(),
  })
  .refine((b) => b.text?.trim() || b.url || b.image, "Send some text, a URL or a screenshot to check.");

export async function POST(request: Request) {
  const missing = missingConfig();
  if (missing.length > 0) {
    return Response.json({ error: `The server is missing ${missing.join(", ")}.` }, { status: 500 });
  }

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: body.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  if (body.data.image && !hasModel("vision")) {
    return Response.json({ error: "Screenshot checking isn't set up on this server." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The client may disconnect mid-run; writing to a cancelled stream throws, so ignore those writes.
      const emit = (event: CheckEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {}
      };
      try {
        await runCheck(body.data, emit, request.signal);
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Something went wrong." });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}
