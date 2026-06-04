export function writesAllowed(): boolean {
  const v = process.env.LEXICON_MCP_ALLOW_WRITES;
  return v === "1" || v === "true";
}

export function assertWritesAllowed(): void {
  if (!writesAllowed()) {
    throw new Error(
      "Write operations are disabled. Set LEXICON_MCP_ALLOW_WRITES=1 to enable PATCH, POST, and DELETE.",
    );
  }
}
