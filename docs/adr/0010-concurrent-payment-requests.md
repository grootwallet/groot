# ADR 0010: Concurrent receive payment requests

- Status: accepted
- Date: 2026-08-03

## Context

A wallet may issue several labeled invoices before any of them is paid. Restricting the receive screen to one awaiting address forced users to retire a valid unpaid request merely to create another one.

## Decision

Allow any number of unused external addresses to remain awaiting payment concurrently. Show all active requests in the receive view. Creating a request never changes another address. The user may select and discard any individual awaiting address with no observed transaction.

## Consequences

The wallet snapshot exposes the full address collection rather than a privileged singular awaiting address. Address creation remains an atomic reveal-and-label operation. Discard remains an indexed state transition, and every retired address continues to be monitored for late payment.
