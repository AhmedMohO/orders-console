## AI tools disclosure

AI helped setting up the project structure, edge cases brainstorming, writing tests and scripts, writing plans and technical documentation, testing application, and simplify documents.

Plugins: Superpowers, Ponytail, graphify

All previous steps before were after i did an analysis of business requirements, database design, and security standards, and code change were reviewed by AI doing a security review after each feature. Furthermore, I did manual testing and reviews at the conclusion of each stage.

# Decisions

## 1. Prevent duplicate orders on retries (R2)

- **Decision:** Give each submission a browser-generated UUID in the `Idempotency-Key` header. Every retry must reuse it.
  Every retry with the same key returns the same response.
- **Alternative:** Detect duplicates by comparing order contents, with the submit button disabled while saving.
- **Why rejected:** Identical orders can be intentional, and disabling a button cannot stop network retries.

## 2. Load orders with cursor pagination

- **Decision:** Fetch a small page at a time.
  The ID breaks ties when orders have the same date or amount.
- **Alternative:** Numbered pages using `OFFSET / LIMIT`.
- **Why rejected:** Deep pages require skipping more rows. New orders can also shift page boundaries while an agent browses.
- **Trade-off:** No direct jump to page 100. Results are a live list, so edits to sort values or filters can still move orders between pages.

## 3. Why Monorepo

- **Decision:** Use Bun workspaces.
  The apps import shared packages directly via local workspaces without publishing to an external package registry.
  - **Team & Organizational Scalability:** Mirrors standard company engineering structures by separating frontend, backend, and shared contracts for parallel development without code duplication.
  - **Why Bun:** Unifies the runtime, workspace package manager, and test runner into a single tool that executes TypeScript and tests natively with zero build config, backed by a high-performance Rust core and instant module caching.
- **Alternative:** Separate repositories, with shared packages published to a private package registry.
- **Why rejected:** A shared field change would require a package release and coordinated updates across repositories.
