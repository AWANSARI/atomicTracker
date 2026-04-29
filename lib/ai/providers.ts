/**
 * AI provider catalog. Used by the connector wizard to:
 *  - render a chooser
 *  - show per-provider how-to-get-key steps
 *  - link to the right console
 *  - validate key shape client-side before sending to test
 *
 * No secrets here — pure metadata, safe to ship to client.
 */

export type ProviderId = "anthropic" | "openai" | "gemini";

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  shortName: string;
  tagline: string;
  consoleUrl: string;
  consoleHost: string;
  steps: string[];
  /** Most keys for this provider start with this prefix. Empty = no enforced prefix. */
  keyPrefix: string;
  keyPlaceholder: string;
  /** Free tier? Used in chooser badging. */
  freeTier: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    shortName: "Claude",
    tagline: "Strong at structured planning. Pay-as-you-go.",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    consoleHost: "console.anthropic.com",
    steps: [
      "Open console.anthropic.com and sign in (or create an account).",
      "Go to Settings → API Keys.",
      "Click Create Key. Name it 'AtomicTracker'.",
      "Copy the key (starts with sk-ant-). You won't see it again.",
    ],
    keyPrefix: "sk-ant-",
    keyPlaceholder: "sk-ant-…",
    freeTier: false,
  },
  openai: {
    id: "openai",
    name: "OpenAI ChatGPT",
    shortName: "OpenAI",
    tagline: "Widely used, well-documented. Pay-as-you-go.",
    consoleUrl: "https://platform.openai.com/api-keys",
    consoleHost: "platform.openai.com",
    steps: [
      "Open platform.openai.com/api-keys and sign in.",
      "Click Create new secret key. Name it 'AtomicTracker'.",
      "Copy the key (starts with sk-). You won't see it again.",
    ],
    keyPrefix: "sk-",
    keyPlaceholder: "sk-…",
    freeTier: false,
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    shortName: "Gemini",
    tagline: "Generous free tier. Already in your Google ecosystem.",
    consoleUrl: "https://aistudio.google.com/apikey",
    consoleHost: "aistudio.google.com",
    steps: [
      "Open aistudio.google.com/apikey (sign in with the same Google account if needed).",
      "Click Create API key. Choose your project (or create a new one).",
      "Copy the key.",
    ],
    keyPrefix: "",
    keyPlaceholder: "AI…",
    freeTier: true,
  },
};

export const PROVIDER_IDS: ProviderId[] = ["anthropic", "openai", "gemini"];
