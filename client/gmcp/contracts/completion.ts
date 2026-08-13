/** Request sent when local command completion has no answer. */
export interface CompletionRequest {
  line: string;
  cursor: number;
}

/** Server response that updates the command line and optionally lists candidates. */
export interface CompletionResult {
  line: string;
  cursor: number;
  matches: string[];
  kind?: string;
  ambiguous: boolean;
}
