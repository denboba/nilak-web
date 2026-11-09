// Nilak: Telegram's wording becomes Nilak where it names this app. Telegram's services (Premium, Stars, FAQ,
// support) and texts about where login codes arrive keep Telegram's name, since they describe Telegram itself.

const PROTECTED_KEYS = new Set([
  'SentAppCode',
  'TelegramFeaturesUsername',
  'NilakApiNote',
]);
const PROTECTED_KEY_PREFIXES = ['SponsoredMessageInfo', 'AboutPremium', 'PremiumPreview', 'ChannelEarn'];
const OVERRIDES: Record<string, string> = {
  LoginQRHelp1: 'Open Nilak or Telegram on your phone',
};
// A whole word "Telegram" (with an optional "Web A"/"Web K"), not inside links, mentions or other words, and not
// the name of a Telegram service. A captured prefix stands in for a lookbehind, which older Safari lacks.
const SERVICE_NAMES = 'Premium|Stars|Business|FAQ|Support|Passport|Gifts?|Desktop';
const BRAND_WORD = new RegExp(
  `(^|[^/@.\\w])Telegram(?:\\s+Web(?:\\s+[AKZ])?)?(?!\\s+(?:${SERVICE_NAMES})\\b)(?!\\w)(?!\\.\\w)`, 'g',
);
const BRAND_NAME = 'Nilak';

const brandedCache = new Map<string, string>();

export function brandString(langKey: string, value: string): string {
  const override = OVERRIDES[langKey];
  if (override) return override;
  if (!value.includes('Telegram') || PROTECTED_KEYS.has(langKey)
    || PROTECTED_KEY_PREFIXES.some((prefix) => langKey.startsWith(prefix))) {
    return value;
  }

  let branded = brandedCache.get(value);
  if (branded === undefined) {
    branded = value.replace(BRAND_WORD, `$1${BRAND_NAME}`);
    brandedCache.set(value, branded);
  }

  return branded;
}
