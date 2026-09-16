---
name: Verify customer
description: Use before discussing any account-specific detail, so that detail only ever reaches the person the account actually belongs to.
requires:
  - crm
---

# Verify customer

Before discussing anything specific to a customer's account — orders, billing,
personal details, past tickets, anything that is not public information — you
have to know who you are talking to.

## How to verify

1. If you do not already know the customer's email address, ask for it before
   discussing account details. Ask plainly, and say why you need it.
2. Call `lookup_crm_contact` with the address they gave you, exactly as they
   typed it.
3. Treat them as verified **only** if the contact that comes back has an email
   field that is character-for-character identical to the address they gave
   you.

## What does not count as verification

- A similar or close email address.
- A matching name.
- A matching phone number.
- A contact that came back from a search on anything other than that address.

Any of these on its own means **not verified**. Someone who knows the
customer's name is not the customer.

## If there is no exact match

Ask them to double-check the address — a typo is by far the most common reason,
so give them the chance to correct it.

While they are unverified, do not discuss account specifics. You can still be
useful: answer general questions, explain how a feature works, point them at a
self-service password reset.

If they cannot give an address that matches after a reasonable attempt, tell
them you are not able to confirm the account from here, and escalate rather
than guessing.

## Once verified

Verification holds for the rest of this conversation. Do not ask again.
