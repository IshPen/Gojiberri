"use node";

import { v } from "convex/values";
import { ActionCtx, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { addDays, dayInPT, formatWindowPT, ptTime } from "./context";
import { chatText } from "./llm";

// ASSUMED Keiki API (confirm with the Keiki team): inbound messages hit /keiki/webhook,
// and we reply with POST {KEIKI_API_URL}/chats/{chatId}/messages { text }.
const KEIKI_API = process.env.KEIKI_API_URL ?? "https://api.keiki.ai/v1";
const APP_LINK = process.env.APP_DEEP_LINK ?? "gojiberri://";

const PLANNER_PROMPT = `You are Gojiberri, a friendly planner living in a friend group's chat.
Answer in 1-2 short sentences. Nudge people to plan with "plan saturday", vote with "vote 2",
or check progress with "status".`;

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

async function post(chatId: string, text: string) {
  const res = await fetch(`${KEIKI_API}/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KEIKI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Keiki send failed (${res.status}): ${await res.text()}`);
}

function targetDay(word: string | undefined): string | null {
  const today = dayInPT(Date.now());
  if (!word) return null;
  const w = word.toLowerCase();
  if (w === "today") return today;
  if (w === "tomorrow") return addDays(today, 1);
  const index = DAYS.findIndex((d) => d.startsWith(w.slice(0, 3)));
  if (index < 0) return null;
  const todayIndex = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, ((index - todayIndex + 7) % 7) || 7);
}

async function pickWindow(ctx: ActionCtx, groupId: Id<"groups">, dayWord: string | undefined) {
  const day = targetDay(dayWord);
  const from = day ? Math.max(ptTime(day, 10), Date.now()) : Date.now();
  const to = day ? ptTime(day, 22) : Date.now() + 7 * 24 * 60 * 60 * 1000;
  const windows: { start: number; end: number }[] = await ctx.runQuery(api.availability.findFreeWindows, {
    groupId,
    from,
    to,
    minHours: 2,
  });
  return windows[0] ?? null;
}

async function waitForOptions(ctx: ActionCtx, planId: Id<"plans">) {
  for (let i = 0; i < 20; i++) {
    const summary = await ctx.runQuery(internal.context.planSummary, { planId });
    if (summary && summary.plan.status !== "generating") return summary;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

function statusText(plan: Doc<"plans">, counts: number[]) {
  const lines = plan.options.map((o, i) => `${i + 1}. ${o.title}: ${counts[i]} vote${counts[i] === 1 ? "" : "s"}`);
  const header =
    plan.status === "locked" && plan.winningIndex !== undefined
      ? `Locked: ${plan.options[plan.winningIndex].title}, ${formatWindowPT(plan.window.start)}`
      : `Voting for ${formatWindowPT(plan.window.start)}`;
  return [header, ...lines].join("\n");
}

export const sendMessage = internalAction({
  args: { chatId: v.string(), text: v.string() },
  handler: async (_ctx, { chatId, text }) => {
    await post(chatId, text);
    return null;
  },
});

export const handleMessage = internalAction({
  args: { chatId: v.string(), sender: v.string(), text: v.string() },
  handler: async (ctx, { chatId, sender, text }): Promise<null> => {
    const reply = (message: string) => post(chatId, message);
    const linked = await ctx.runQuery(internal.context.groupByChat, { chatId });

    if (!linked) {
      const code = text.toUpperCase().match(/\b[A-Z0-9]{6}\b/)?.[0];
      const groupName = code ? await ctx.runMutation(internal.context.linkChat, { chatId, inviteCode: code }) : null;
      await reply(
        groupName
          ? `Linked this chat to ${groupName}! Say "plan saturday" to get 3 ideas.`
          : "Hi! Send your Gojiberri group's 6-character invite code to link this chat.",
      );
      return null;
    }

    const { group, members } = linked;
    const senderName = sender.trim().toLowerCase();
    const matches = members.filter((m) => m.name.trim().toLowerCase() === senderName);
    const [command, arg] = text.trim().split(/\s+/);
    const isAction = ["plan", "vote"].includes(command.toLowerCase());
    if (isAction && matches.length !== 1) {
      await reply(`I can't tell who "${sender}" is in ${group.name}. Use the same name as your Gojiberri profile.`);
      return null;
    }
    const member = matches[0] ?? members.find((m) => m._id === group.ownerId)!;

    switch (command.toLowerCase()) {
      case "plan": {
        const window = await pickWindow(ctx, group._id, arg);
        if (!window) {
          await reply(`Nobody's free together${arg ? ` ${arg}` : " this week"} for 2+ hours. Try another day.`);
          return null;
        }
        const planId: Id<"plans"> = await ctx.runMutation(api.plans.createPlan, {
          userId: member._id,
          groupId: group._id,
          window,
        });
        await reply(`On it, finding 3 ideas for ${formatWindowPT(window.start)}...`);
        const summary = await waitForOptions(ctx, planId);
        if (!summary) {
          await reply("Still thinking. Check the app in a minute.");
          return null;
        }
        const options = summary.plan.options.map(
          (o, i) => `${i + 1}. ${o.title} ($${o.costMin}-${o.costMax})${o.sponsorId ? " [Sponsored]" : ""}\n   ${o.why}`,
        );
        await reply([`Here are your options:`, ...options, `Reply "vote 1", "vote 2" or "vote 3".`].join("\n"));
        return null;
      }
      case "vote": {
        const plan = await ctx.runQuery(internal.context.latestOpenPlan, { groupId: group._id });
        const choice = Number(arg);
        if (!plan || plan.status !== "voting") {
          await reply('No vote is open right now. Say "plan saturday" to start one.');
          return null;
        }
        if (!Number.isInteger(choice) || choice < 1 || choice > plan.options.length) {
          await reply(`Pick a number from 1 to ${plan.options.length}.`);
          return null;
        }
        await ctx.runMutation(api.votes.castVote, {
          userId: member._id,
          planId: plan._id,
          optionIndex: choice - 1,
        });
        await reply(`${member.name} voted for ${plan.options[choice - 1].title}.`);
        return null;
      }
      case "status": {
        const plan = await ctx.runQuery(internal.context.latestOpenPlan, { groupId: group._id });
        const summary = plan ? await ctx.runQuery(internal.context.planSummary, { planId: plan._id }) : null;
        await reply(summary ? statusText(summary.plan, summary.counts) : 'Nothing planned yet. Say "plan saturday".');
        return null;
      }
      default: {
        let answer: string;
        try {
          answer = await chatText(PLANNER_PROMPT, `${member.name} in ${group.name}: ${text}`);
        } catch (err) {
          console.warn("Keiki LLM reply failed", err);
          answer = 'Want to hang out? Say "plan saturday" and I\'ll find 3 ideas.';
        }
        await reply(answer || 'Say "plan saturday" and I\'ll find 3 ideas.');
        return null;
      }
    }
  },
});

// Ishan: schedule from votes.castVote (and the confirmBy auto-lock) when a plan locks.
export const announceLock = internalAction({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }): Promise<null> => {
    const summary = await ctx.runQuery(internal.context.planSummary, { planId });
    if (!summary?.keikiChatId || summary.plan.winningIndex === undefined) return null;
    const winner = summary.plan.options[summary.plan.winningIndex];
    await post(
      summary.keikiChatId,
      `Locked! ${winner.title} ${formatWindowPT(summary.plan.window.start)}. Confirm in the app: ${APP_LINK}plan/${planId}`,
    );
    return null;
  },
});
