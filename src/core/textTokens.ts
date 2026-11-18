// Reaproveitado de B:\AntiGravity\noiser-reconizer\src\core\textTokens.ts

export const TOKEN_STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'is', 'are', 'was', 'were', 'it', 'this', 'that', 'as', 'be', 'into', 'over', 'under',
  'image', 'photo', 'realistic', 'style', 'high', 'quality', 'ultra', 'detailed', '4k', '8k',
  'best', 'masterpiece', 'portrait', 'view', 'shot', 'scene',
  'o', 'os', 'um', 'uma', 'e', 'ou', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na',
  'nos', 'nas', 'por', 'com', 'para', 'como', 'que', 'se', 'ao', 'aos',
  'fdr_version', 'metadata', 'prompt', 'storage_context', 'archive_tag',
  'simulated_environment', 'camera_technical', 'capture_intent', 'device_simulation',
  'look', 'depth_of_field', 'lighting', 'true', 'false', 'null', 'json',
])

export function splitPromptDelimiters(text: string): string[] {
  return text.split(/(\s+|[,;:.!?()[\]"']+)/).filter(Boolean)
}

export function normalizePromptToken(token: string): string {
  return token.toLowerCase().replace(/^[^\w\d]+|[^\w\d]+$/g, '').trim()
}

export function extractKeywordTokens(
  text: string,
  options?: { minLen?: number; maxLen?: number; pattern?: RegExp }
): string[] {
  const minLen = options?.minLen ?? 3
  const maxLen = options?.maxLen ?? 28
  const regex = options?.pattern ?? /[a-z0-9à-ú_-]+/g
  const stripped = text.replace(/<[^>]*>/g, ' ').toLowerCase()
  const matches = stripped.match(regex) || []
  const uniq = new Set<string>()
  for (const m of matches) {
    if (m.length >= minLen && m.length <= maxLen && !TOKEN_STOP_WORDS.has(m)) {
      uniq.add(m)
    }
  }
  return Array.from(uniq)
}
