# Decisions

## Why Monorepo?

We chose a monorepo using Bun workspaces because our database, API, and frontend are closely related.

It allows us to **share types and schemas**, **manage full-stack changes in one place**, and **run and test everything with a single setup**.

This reduces code duplication, improves consistency, and makes development easier.
