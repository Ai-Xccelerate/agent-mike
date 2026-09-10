const INJECTION_PATTERNS = [
  "ignore previous instructions",
  "ignore all instructions",
  "reveal your system prompt",
  "show me your system prompt",
  "developer message",
  "jailbreak",
];

export interface GuardrailInput {
  message: string;
  senderEmail?: string | null;
  escalationTerms: string[];
  allowedDomains: string[];
  requireUserVerification: boolean;
}

export interface GuardrailDecision {
  escalate: boolean;
  reason: string | null;
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  return email.slice(at + 1).toLowerCase();
}

/**
 * R10: domain/user communication restriction is a standard, foundation-level
 * guardrail, not something built per-worker. R11: user verification is a
 * reusable pattern (an instruction + an external lookup), not a one-off
 * codebase — evaluateMessage() only handles the parts that are genuinely
 * deterministic logic (per Rahul: "it's a logic, basically. It can't be an
 * instruction."); the actual verification lookup is left to a tool call the
 * agent makes, not hardcoded here.
 */
export function evaluateMessage(input: GuardrailInput): GuardrailDecision {
  const normalized = input.message.toLowerCase();

  for (const pattern of INJECTION_PATTERNS) {
    if (normalized.includes(pattern)) {
      return { escalate: true, reason: "Potential prompt injection" };
    }
  }

  for (const term of input.escalationTerms) {
    if (term && normalized.includes(term.toLowerCase())) {
      return { escalate: true, reason: `Escalation policy matched: ${term}` };
    }
  }

  if (input.allowedDomains.length > 0) {
    const domain = input.senderEmail ? domainOf(input.senderEmail) : null;
    if (!domain || !input.allowedDomains.includes(domain)) {
      return {
        escalate: true,
        reason: domain
          ? `Sender domain "${domain}" is not on the allowed list`
          : "Sender domain could not be determined",
      };
    }
  }

  return { escalate: false, reason: null };
}
