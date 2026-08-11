// Token-shaped strings are redacted at import time, before anything is
// stored or rendered (SPEC_V0.1 §3.2).
const SECRET_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{20,255}\b/g, // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
  /\bgithub_pat_[A-Za-z0-9_]{20,255}\b/g, // GitHub fine-grained PATs
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key ids
  // Common API secret keys. The tail is alphanumeric-only on purpose:
  // allowing hyphens made kebab-case prose like
  // 'sk-learn-compatible-estimators-refactor' vanish into '[redacted]'.
  /\bsk-(?:[A-Za-z0-9]+-)?[A-Za-z0-9]{20,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
]

export function redactSecrets(text: string): string {
  let out = text
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[redacted]')
  }
  return out
}
