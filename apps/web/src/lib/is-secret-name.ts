/** Display heuristic for Variable previews, not a secrecy boundary. */
export function isSecretName(name: string): boolean {
  return /secret|token|password|passwd|pwd|cred|auth|private|key/i.test(name);
}
