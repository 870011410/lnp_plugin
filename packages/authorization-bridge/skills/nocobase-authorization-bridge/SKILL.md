---
name: nocobase-authorization-bridge
description: Connect a NocoBase 3 child application to the main application's remote permission management without moving its authorization database.
---

Read the package README. Register the public `createAuthorizationBridge` server export with a stable appId, release version and shared, real page manifest. Use native Authorization declarations for business actions and data scopes; never replace the child authorization engine or write its private tables. Check existing native API documentation before proxying its routes. Require a user-supplied, existing dedicated service credential and narrow its scope; never create a key or grant an account automatically. Profiles remain read-only and role assignments use exact child user ids. Verify anonymous and unauthorized metadata reads, and require an explicit workflow-reference check before enabling role deletion.

Build the public display dictionary with the same package's `createAuthorizationMessages(namespace, locales)` export. Collection captions come from live `authz.database.collections` registrations and cross the metadata boundary as `collections: [{ name, title }]`; title descriptors should include their owning namespace. Consumers merge them into existing options by Collection name and render them using the existing `messages` dictionary, keeping ids and grants intact. Accept missing Collection metadata from older bridges and use the original name as fallback. Do not copy a child application's local UI title mapping into each receiving application.
