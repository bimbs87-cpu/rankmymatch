/**
 * Generate authentic sport images via Lovable AI Gateway (nano banana 2),
 * upload them to the public `group-images` Supabase bucket, and print
 * the resulting URLs grouped by sport.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY || !LOVABLE_API_KEY) {
  console.error("Missing env", { SUPABASE_URL: !!SUPABASE_URL, SERVICE_KEY: !!SERVICE_KEY, LOVABLE_API_KEY: !!LOVABLE_API_KEY });
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const BUCKET = "group-images";

type SportKey = "padel" | "tennis" | "beach_tennis";

const PROMPTS: Record<SportKey, string[]> = {
  padel: [
    "Professional photo of a modern padel court with blue surface and glass walls, two pairs playing doubles match, golden hour lighting, photorealistic, vibrant colors",
    "Close-up photo of two padel rackets and a yellow padel ball resting on a blue padel court, professional sports photography, sharp focus",
    "Wide shot of an indoor padel club with multiple glass-walled courts, players in action, modern facility, professional sports photography",
    "Padel player executing a powerful smash near the glass wall, dynamic action shot, blue court, professional sports photography, motion blur on the racket",
    "Outdoor padel court at night under stadium lights, glass walls reflecting, two players warming up, dramatic lighting, photorealistic",
    "Top-down aerial photo of a padel court with four players in doubles formation, blue surface, clearly showing the glass walls and net",
    "Padel doubles team celebrating a winning point on a blue court, glass walls in background, joyful expressions, professional sports photography",
    "Detailed photo of a padel paddle racket leaning against the metallic mesh wall of a padel court, yellow ball on the ground, clay-toned blue court",
  ],
  tennis: [
    "Professional photo of a clay tennis court with a player serving, red clay, white lines, tennis racket mid-swing, golden hour, photorealistic",
    "Close-up photo of three yellow tennis balls and a modern tennis racket on a green hard court, professional sports photography",
    "Wide shot of an outdoor tennis club with multiple hard courts, players in match, blue and green courts, professional facility",
    "Tennis player executing a powerful forehand, action shot on a hard court, motion of the racket, professional sports photography",
    "Aerial top-down view of a tennis court with two singles players, clay surface, white lines clearly visible, photorealistic",
    "Tennis ball hitting the strings of a racket in extreme close-up, dramatic lighting, water droplets, professional sports photography",
    "Tennis doubles match on a grass court, four players in white outfits, traditional Wimbledon-style setting, photorealistic",
    "Empty tennis court at sunset with long shadows, net in foreground, hard blue court, peaceful and atmospheric, photorealistic",
  ],
  beach_tennis: [
    "Professional photo of a beach tennis match on white sand by the ocean, two pairs playing doubles, beach tennis paddles and yellow ball, sunny day, photorealistic",
    "Close-up of a beach tennis paddle (carbon fiber, no strings, with holes) and a yellow ball lying on golden sand, professional sports photography",
    "Beach tennis court on the seaside with a low net, two players ready to receive serve, clear blue sky, sun, photorealistic",
    "Beach tennis player diving for a ball, splash of sand, dynamic action shot, beach in background, professional sports photography",
    "Wide shot of a beach tennis tournament with multiple sand courts side by side, players, spectators, ocean in background, sunny day",
    "Two beach tennis players high-fiving over the net after a great point, sand court, beach setting, joyful, professional sports photography",
    "Top-down aerial photo of a beach tennis court on white sand by the ocean, four players visible in doubles formation, low net",
    "Detailed photo of three beach tennis paddles and a ball stuck in the sand by the net, sunset lighting on the beach, photorealistic",
  ],
};

async function generateImage(prompt: string): Promise<Buffer> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image-preview",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url || !url.startsWith("data:image/")) throw new Error("No image returned");
  const b64 = url.split(",")[1];
  return Buffer.from(b64, "base64");
}

async function uploadImage(sport: SportKey, idx: number, buf: Buffer): Promise<string> {
  const path = `fictional/${sport}-${idx + 1}-${Date.now()}.png`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function main() {
  const result: Record<SportKey, string[]> = { padel: [], tennis: [], beach_tennis: [] };
  for (const sport of Object.keys(PROMPTS) as SportKey[]) {
    const prompts = PROMPTS[sport];
    console.error(`\n=== ${sport} (${prompts.length} images) ===`);
    for (let i = 0; i < prompts.length; i++) {
      const p = prompts[i];
      try {
        console.error(`[${sport} ${i + 1}/${prompts.length}] generating…`);
        const buf = await generateImage(p);
        const url = await uploadImage(sport, i, buf);
        result[sport].push(url);
        console.error(`  ✓ ${url}`);
      } catch (e: any) {
        console.error(`  ✗ ${e.message}`);
      }
    }
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
