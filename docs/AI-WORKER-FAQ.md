# AI Worker FAQ

Quick answers about what your AI Worker does, how to set it up, and how its Assistant helps you manage it.

> Sample document. Details may change as the product evolves.

**Topics:** [The basics](#the-basics) · [Setup](#setup) · [The Assistant](#the-assistant) · [Safety and control](#safety-and-control) · [Limits](#limits)

---

## The basics

### What is the AI Worker?

An AI teammate that answers your customers. It replies over website chat and can send email from a connected mailbox, using your knowledge base to give accurate answers.

### Where do customers talk to it?

On your website through the chat widget, and by email once a mailbox is connected. You can test it yourself in the Playground before going live.

### What happens when it can't answer?

It hands the conversation to your human manager and tells the customer someone will follow up. Handed-off conversations show up in **Inbox** as needing you, where you can read them, take over, and reply yourself.

### Where does it get its answers?

From your knowledge base: the articles and documents you add. It cites what it used. If nothing in your knowledge covers a question, it says so or hands off instead of guessing.

---

## Setup

### What should I set up first?

- **Role:** what the worker handles. This is the core of how it behaves.
- **Knowledge:** your policies and help articles.
- **Human manager:** the name customers hear when a conversation is handed off.
- **Escalation phrases:** topics that should always go to a person, like refunds or legal questions.

Not sure what's missing? Ask the Assistant to "check my setup".

### How do I add to the knowledge base?

Upload PDF, Markdown, or text files in **Settings > Knowledge**, or attach a file in the Assistant and choose **Add to knowledge base**. If a file overlaps an existing article, the Assistant asks whether to update that article instead of creating a duplicate.

### How do I let it send email?

1. Turn on the Email channel in **Settings > Channels**.
2. Connect the sending mailbox in **Settings > Tools**.
3. Approve the domains it may email in **Settings > Email domains**. Email to any other domain is refused.

### What are skills?

Step-by-step instructions the worker follows in specific situations, like collecting details before escalating. Turn them on in **Settings > Skills**. You can also attach a procedure document in the Assistant and choose **Turn into a skill**.

### Can it look things up in our other systems?

Yes. Connect your CRM (Zoho), helpdesk (Jira), project tool (Linear), email (Gmail or Outlook), or calendar (Google Calendar) in **Settings > Integrations**. Connecting opens a sign-in with that provider.

---

## The Assistant

### What is the Assistant?

Your own chat for managing the worker. It's for you, not your customers. Ask it about conversations, have it explain any setting, draft replies, or change your setup.

### What can I ask it?

- "What needs my attention?"
- "Summarize the latest escalation."
- "Draft a reply to ticket 1002."
- "Check my setup and tell me what's wrong."
- "Turn on the collect-before-escalate skill."

### Can it change settings for me?

Yes, almost all of them: role, tone, escalation phrases, skills, channels, model, email domains, integrations, and more. It always shows you the change first and waits for you to approve it.

### What happens when I attach a file?

You choose what the file is for:

- **Use in this chat:** the Assistant reads it to answer you. Nothing is saved.
- **Add to knowledge base:** it proposes a new or updated article.
- **Turn into a skill:** it drafts a skill from the steps in the file.

Up to 5 files at a time, 8 MB each: PDF, Markdown, text, CSV, JSON, HTML, or YAML.

### What are the panels in the chat?

Interactive lists for Skills, Knowledge, Integrations, Tools, Channels, and Email domains. They show what's on and let you turn things on, off, or connect them without leaving the chat. Open them from the shortcuts on the Assistant's start screen, or just ask.

---

## Safety and control

### Will the Assistant change anything without asking?

No. Every change appears on an approval card showing exactly what will change. Nothing happens until you click **Approve**, and you can **Cancel** at any time. Proposals you don't answer expire after 24 hours.

### Can it reply to customers on its own?

Only if you turn on **Let the Assistant take actions** in **Settings > Guardrails**, and even then each reply needs your approval. The Assistant can't turn this setting on for itself.

### How do I make sure sensitive topics reach a person?

Add them as escalation phrases in **Settings > Guardrails**. You can also raise the minimum confidence there, so the worker hands off more often when it's unsure.

---

## Limits

### What isn't available yet?

- A voice channel.
- The worker reading and answering a support inbox on its own.
- Email notifications when a conversation is escalated. Escalations appear in Inbox.
- Pausing the worker from its status setting.
- Word, PowerPoint, and Excel uploads, and scanned PDFs without a text layer.
