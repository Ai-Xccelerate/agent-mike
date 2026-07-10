from dataclasses import dataclass

from app.models import AgentProfile


INJECTION_PATTERNS = (
    "ignore previous instructions",
    "ignore all instructions",
    "reveal your system prompt",
    "show me your system prompt",
    "developer message",
    "jailbreak",
)


@dataclass
class GuardrailDecision:
    escalate: bool
    reason: str | None = None


def evaluate_message(message: str, profile: AgentProfile) -> GuardrailDecision:
    normalized = message.lower()
    for pattern in INJECTION_PATTERNS:
        if pattern in normalized:
            return GuardrailDecision(True, "Potential prompt injection")
    for term in profile.escalation_terms:
        if term.lower() in normalized:
            return GuardrailDecision(True, f"Escalation policy matched: {term}")
    return GuardrailDecision(False)

