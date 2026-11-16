import { env } from "./_generated/server";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

type Message = { role: "system" | "user"; content: string };

async function complete(messages: Message[], json: boolean): Promise<string> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function chatJSON<T>(system: string, user: unknown): Promise<T> {
  const content = typeof user === "string" ? user : JSON.stringify(user);
  return JSON.parse(await complete([{ role: "system", content: system }, { role: "user", content }], true)) as T;
}

export async function visionJSON<T>(system: string, text: string, imageUrl: string, timeoutMs: number): Promise<T> {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`OpenAI vision request failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return JSON.parse(data.choices?.[0]?.message?.content?.trim() ?? "") as T;
}

export async function chatText(system: string, user: string): Promise<string> {
  return await complete([{ role: "system", content: system }, { role: "user", content: user }], false);
}
