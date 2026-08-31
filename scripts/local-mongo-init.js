/*
 * TeamNest.ai — Local MongoDB init (OPTIONAL)
 * ------------------------------------------------------------------
 * This is the MongoDB equivalent of a ".sql" file — but you usually do NOT
 * need it. MongoDB is schemaless: collections are created automatically on the
 * first write, and the FastAPI backend builds every index on startup
 * (all create_index calls are idempotent). So the simplest "just run it" is:
 *
 *     1. Start MongoDB           (e.g. docker run -d -p 27017:27017 mongo:7)
 *     2. Set backend/.env        MONGO_URL="mongodb://localhost:27017"
 *                                DB_NAME="test_database"
 *     3. Start the backend       (uvicorn) — it creates collections + indexes
 *     4. Sign up in the web app  (POST /api/auth/signup) to create your first
 *                                owner user + workspace.
 *
 * Run this script ONLY if you want the important indexes created up front:
 *     mongosh "mongodb://localhost:27017/test_database" scripts/local-mongo-init.js
 *
 * It mirrors the index definitions the app creates in:
 *   server.py, services/memory_rag.py, services/knowledge_ingest.py,
 *   services/login_throttle.py, services/iap_revenuecat.py
 */

// Uses the database from the mongosh connection string (…/test_database).
print("Creating TeamNest indexes on DB: " + db.getName());

// --- Chat messages: fast per-chat, newest-first reads
db.messages.createIndex({ chat_id: 1, created_at: -1 });

// --- Knowledge base: lexical text search + scope lookups
db.knowledge_chunks.createIndex({ source_id: 1, text: "text" });
db.knowledge_chunks.createIndex({ chat_id: 1 });
db.knowledge_sources.createIndex({ workspace_id: 1, created_at: -1 });

// --- Team memory (RAG): text index + scope indexes
db.memory_items.createIndex({ search_text: "text" }, { name: "memory_text_idx", default_language: "english" });
db.memory_items.createIndex({ workspace_id: 1, status: 1, created_at: -1 }, { name: "memory_scope_idx" });
db.memory_items.createIndex({ source_type: 1, source_id: 1 });
db.memory_items.createIndex({ chat_id: 1 });
db.memory_items.createIndex({ project_folder_id: 1 });

// --- Login throttling: unique identifier + TTL auto-expiry
db.login_attempts.createIndex({ identifier: 1 }, { unique: true });
db.login_attempts.createIndex({ expire_at: 1 }, { expireAfterSeconds: 0 });

// --- In-app purchases / RevenueCat idempotency (unique)
db.rc_events.createIndex({ event_id: 1 }, { unique: true });
db.iap_credit_grants.createIndex({ txn_key: 1 }, { unique: true });

// --- Common lookup keys used across the app (safe, optional)
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ workspace_id: 1, status: 1 });
db.workspaces.createIndex({ id: 1 }, { unique: true });
db.chats.createIndex({ workspace_id: 1, updated_at: -1 });
db.tasks.createIndex({ workspace_id: 1, status: 1 });

print("Done. Remaining collections + indexes are created by the backend on startup.");
