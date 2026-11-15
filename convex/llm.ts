import OpenAI from "openai";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

function client() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 25_000, maxRetries: 1 });
}

export async function chatJSON<T>(system: string, user: unknown): Promise<T> {
  const res = await client().chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: typeof user === "string" ? user : JSON.stringify(user) },
    ],
  });
  return JSON.parse(res.choices[0]?.message?.content ?? "") as T;
}

export async function chatText(system: string, user: string): Promise<string> {
  const res = await client().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}
