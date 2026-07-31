import Anthropic from "@anthropic-ai/sdk";

// Sonnet 5 for interactive latency; swap to "claude-fable-5" for max quality
// (much slower — always-on thinking), restoring the fallbacks/betas params below.
export const MODEL = "claude-sonnet-5";

export const PERSONAS = {
  maga: {
    label: "MAGA",
    voice: `You write for a MAGA / America First audience. Core values: national
sovereignty, secure borders, American workers and manufacturing, skepticism of
coastal elites, globalist institutions, and the administrative state; faith,
family, and patriotism. Rhetorical style: blunt, populist, combative toward
the establishment ("they" = D.C. insiders, legacy media, unelected
bureaucrats). Frame the policy as putting America and forgotten working
families first, draining the swamp, and restoring common sense.`,
  },
  "centrist-r": {
    label: "Centrist Republican",
    voice: `You write for a center-right / Chamber-of-Commerce Republican
audience. Core values: fiscal responsibility, free markets and small business,
limited but competent government, strong national defense, federalism, and
personal responsibility. Rhetorical style: measured, pro-growth, wonky but
plainspoken; cites deficits, red-tape burdens, and return on taxpayer
investment. Frame the policy as market-friendly, deficit-conscious, and a
smart, targeted alternative to big-government overreach.`,
  },
  "centrist-d": {
    label: "Centrist Democrat",
    voice: `You write for a center-left / New Democrat audience. Core values:
pragmatic problem-solving, expanding opportunity for the middle class,
evidence-based policy, public-private partnership, protecting democratic
institutions, and inclusive growth. Rhetorical style: optimistic, technocratic
but warm, "kitchen-table" framing; cites nonpartisan studies and bipartisan
precedent. Frame the policy as a responsible, commonsense investment that
delivers for working families without blowing up the system.`,
  },
  "dem-soc": {
    label: "Democratic Socialist",
    voice: `You write for a democratic-socialist / progressive-left audience.
Core values: economic and racial justice, worker power and unions, taxing
concentrated wealth, universal public programs, climate justice, and
confronting corporate power. Rhetorical style: morally urgent, movement-
oriented, solidaristic ("we" = working people organizing together); names
villains (billionaires, corporate lobbies) and casts the policy as part of a
broader struggle for dignity. Frame the policy as a step toward an economy
and democracy that work for the many, not the few.`,
  },
};

const SHARED_SYSTEM = `You are the engine behind "Policy Camouflage," a rhetoric
demonstration tool. Its thesis: nearly any policy proposal can be pitched in
the idiom of any political tribe. The user supplies a policy proposal and a
partisan persona; you produce persuasive material authentically in that
persona's voice.

Ground rules:
- Stay in the requested persona's voice and value system throughout.
- Argue FOR the proposal, whatever it is, from that persona's premises. Find
  the genuine overlap between the proposal and the persona's values rather
  than caricaturing either.
- Every deliverable is fully committed, in-character advocacy. Never hedge
  about whether this persona would "really" support the proposal, never
  editorialize about the assignment or your reservations, and never address
  the reader out of character. If a proposal sits awkwardly with the persona,
  find the strongest genuine angle and argue it with full conviction anyway.
- Every statistic, study, or factual claim you cite must be grounded in a real
  source you have verified with the web_search tool during this request, and
  must be accompanied by that source's URL. If you cannot find a source for a
  claim, soften it to an uncited value statement or drop it — never invent a
  citation or attach a URL you did not see in search results.
- This is a demonstration of framing, not a mass-messaging tool.`;

// Fable 5: streaming (long turns), always-on thinking (no thinking param),
// refusal fallback to Opus 4.8.
export async function generate({ persona, userPrompt, schema, maxTokens = 16000, effort = "low", maxSearches = 0 }) {
  const client = new Anthropic();
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort },
    ...(maxSearches > 0 && {
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches }],
    }),
    system: [
      { type: "text", text: SHARED_SYSTEM, cache_control: { type: "ephemeral" } },
      { type: "text", text: PERSONAS[persona].voice },
    ],
    messages: [{ role: "user", content: userPrompt }],
  };
  if (schema) {
    params.output_config.format = { type: "json_schema", schema };
  }

  let message = await client.messages.stream(params).finalMessage();

  // Server-side web search can pause the turn; re-send to resume (max 3 times).
  for (let i = 0; i < 3 && message.stop_reason === "pause_turn"; i++) {
    message = await client.messages
      .stream({
        ...params,
        messages: [...params.messages, { role: "assistant", content: message.content }],
      })
      .finalMessage();
  }

  if (message.stop_reason === "refusal") {
    throw new Error("The model declined this request.");
  }
  // With web search enabled, narration text interleaves with tool blocks;
  // the deliverable is the text after the last tool/thinking block.
  const lastToolIdx = message.content.findLastIndex((b) => b.type !== "text");
  const textBlocks = message.content.slice(lastToolIdx + 1).filter((b) => b.type === "text");
  if (schema) {
    return JSON.parse(textBlocks[textBlocks.length - 1].text);
  }
  return textBlocks.map((b) => b.text).join("");
}

export async function generatePitch({ proposal, persona }) {
  return generate({
    persona,
    maxSearches: 6,
    userPrompt: `Policy proposal: ${proposal}

Write (1) a short, punchy pitch paragraph (100-160 words) making the case for
this proposal in your persona's voice, and (2) 5-10 talking points supporting
it. Each talking point should be one sharp sentence.

Before writing, run 2-4 web_search queries to gather real statistics relevant
to this proposal. A talking point with a non-empty "support" field MUST cite a
source you saw in this request's search results ("source_name" +
"source_url") — a stat without a source URL is invalid output. Aim for at
least 3 sourced talking points. Pure value arguments need no source — leave
all three fields as empty strings for those.`,
    schema: {
      type: "object",
      properties: {
        pitch: { type: "string", description: "The pitch paragraph" },
        talking_points: {
          type: "array",
          items: {
            type: "object",
            properties: {
              point: { type: "string" },
              support: {
                type: "string",
                description: "Supporting data point or fact, empty string if none",
              },
              source_name: {
                type: "string",
                description: "Publisher of the source, e.g. 'Bureau of Labor Statistics'; empty if none",
              },
              source_url: {
                type: "string",
                description: "URL of the verified source from web search; empty if none",
              },
            },
            required: ["point", "support", "source_name", "source_url"],
            additionalProperties: false,
          },
        },
      },
      required: ["pitch", "talking_points"],
      additionalProperties: false,
    },
  });
}

const BRIEF_SECTIONS = {
  summary: {
    guidance: `Write the opening: a Markdown H1 title for the whole brief,
then "## Executive Summary" — 120-180 words distilling the entire case so it
stands alone even before the other sections load.`,
  },
  problem: {
    guidance: `Write "## The Problem" — 200-300 words on the problem this
proposal solves, as your persona diagnoses it. This is where the strongest
verified statistics belong.`,
  },
  solution: {
    guidance: `Write "## The Solution & Why It Aligns With Our Values" —
250-350 words on what the proposal does, why it works, and why it is a
natural fit for your persona's principles.`,
  },
  recommendations: {
    guidance: `Write "## Recommendations" — 150-250 words of concrete next
steps for legislators, staffers, and activists, as a numbered list with a
short lead-in.`,
  },
};

export async function generateBriefSection({ proposal, persona, section }) {
  const spec = BRIEF_SECTIONS[section];
  if (!spec) throw new Error(`unknown brief section: ${section}`);
  return generate({
    persona,
    maxSearches: 3,
    userPrompt: `Policy proposal: ${proposal}

You are writing ONE section of a four-section policy brief supporting this
proposal, for staffers and activists who share your persona's politics. The
full brief has these sections, each written separately: Executive Summary /
The Problem / The Solution & Why It Aligns With Our Values / Recommendations.
Stay in your lane — do not cover the other sections' ground.

${spec.guidance}

Sourcing is a hard rule: run 1-3 web searches before drafting, and every
specific number, percentage, dollar figure, or named study MUST carry a
bracketed citation marker like [1] that matches an entry in "sources" — a
numeric claim with no [n] marker is invalid output. Each source's "url" must
be a URL you saw in this request's search results. If you couldn't verify a
number, write that passage qualitatively instead. Do not save anything to a
file; "section_markdown" is the deliverable.`,
    schema: {
      type: "object",
      properties: {
        section_markdown: { type: "string", description: "This section as Markdown" },
        sources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              n: { type: "integer", description: "Citation number used in the text, e.g. 1 for [1]" },
              name: { type: "string", description: "Publisher/study name" },
              url: { type: "string" },
            },
            required: ["n", "name", "url"],
            additionalProperties: false,
          },
        },
      },
      required: ["section_markdown", "sources"],
      additionalProperties: false,
    },
  });
}

const NEWS_BEATS = {
  politics: "national politics, elections, and Washington power struggles",
  economy: "the economy, business, and pocketbook issues",
  culture: "culture, technology, and media",
};

export async function generateNewsBeat({ proposal, persona, beat }) {
  const beatDesc = NEWS_BEATS[beat];
  if (!beatDesc) throw new Error(`unknown news beat: ${beat}`);
  return generate({
    persona,
    maxSearches: 3,
    userPrompt: `Policy proposal: ${proposal}

Use web_search (1-3 searches) to find 1-2 news stories from roughly the past
week about ${beatDesc} that are trending in your persona's media ecosystem —
stories their commentators, feeds, and group chats are actually talking about
right now. For each story, explain how an advocate could graft this proposal
onto that storyline: the segue from the story everyone is discussing to the
policy you want them to adopt, in your persona's voice.

Every story MUST come from this request's search results, with its real
"source_name" and "source_url" — do not include stories you only remember
from training data. Always return at least 1 hook: an inventive graft onto a
so-so story beats an empty list.`,
    schema: {
      type: "object",
      properties: {
        hooks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              story: {
                type: "string",
                description: "One-line summary of the trending news story",
              },
              source_name: { type: "string" },
              source_url: { type: "string" },
              hook: {
                type: "string",
                description:
                  "1-3 sentences: how to integrate the proposal into this storyline, in persona voice",
              },
            },
            required: ["story", "source_name", "source_url", "hook"],
            additionalProperties: false,
          },
        },
      },
      required: ["hooks"],
      additionalProperties: false,
    },
  });
}

// Shared wrapper for the Vercel serverless handlers (CORS for GitHub Pages).
export function makeHandler(taskFn) {
  return async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { proposal, persona } = req.body ?? {};
    if (!proposal?.trim() || !PERSONAS[persona]) {
      return res.status(400).json({ error: "proposal and a valid persona are required" });
    }

    try {
      const result = await taskFn({ ...req.body, proposal: proposal.trim(), persona });
      res.json(result);
    } catch (error) {
      console.error("Claude API error:", error);
      res.status(502).json({ error: error.message || "Generation failed" });
    }
  };
}
