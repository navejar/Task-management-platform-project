# AI Interaction Record

## Session 1: Authenticating WebSocket Connections with JWT

### Prompt (sent to ChatGPT)

> We have a Node.js Express backend using JWT for REST API auth. We're adding a WebSocket server with the `ws` library on the same HTTP server. How should we authenticate WebSocket connections so only logged-in users can connect? The frontend stores the JWT in sessionStorage.

### AI Response (trimmed)

The AI recommended passing the JWT as a query parameter in the WebSocket URL (`ws://host/ws?token=xxx`), noting that the browser `WebSocket` API does not support custom headers. It provided sample server code:

```javascript
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  try {
    const user = jwt.verify(token, JWT_SECRET);
    // store user info, proceed
  } catch (err) {
    ws.close(1008, 'Invalid token');
  }
});
```

It also suggested storing each authenticated connection in a `Map` keyed by user ID for targeted messaging.

### What Our Team Did With It

- The query parameter approach and the `Map` for tracking clients were both adopted directly — our server uses `clients.set(ws, { userId, username, role })` for broadcasting.
- The AI used close code `1008` for auth failures. We used custom codes (`4001` for missing token, `4003` for invalid) to distinguish failure modes on the client side. The AI also didn't explain why `new URL()` requires a base URL when parsing `req.url`, which caused a `TypeError` until we added it.
- Tested with valid, expired, and missing tokens via the browser console. Confirmed correct close codes and that logout stops event delivery.

---

## Session 2: Handling Session Recovery During Backend Downtime

### Prompt (sent to ChatGPT)

> On page load, our React app calls `GET /api/auth/me` to verify the JWT. During Docker Swarm rolling updates, the API is briefly unreachable and users get logged out on refresh even though their token is still valid. How do we handle this?

### AI Response (trimmed)

The AI suggested caching the user object in sessionStorage and differentiating between 401/403 errors (invalid token — clear session) and network errors (backend down — fall back to cached user data). It provided a code snippet:

```javascript
try {
  const res = await api.get('/auth/me');
  setUser(res.data.user);
} catch (err) {
  if (err.response?.status === 401 || err.response?.status === 403) {
    // Token is invalid — log out
    clearSession();
  } else {
    // Network error or server down — use cached data
    const cached = sessionStorage.getItem('user');
    if (cached) setUser(JSON.parse(cached));
  }
}
```

### What Our Team Did With It

- The 401/403 vs. network error distinction was adopted directly in `AuthContext.js` and lets sessions survive brief outages during rolling updates.
- The AI didn't handle corrupted sessionStorage — `JSON.parse()` can throw on malformed data. We added a `try/catch` around the cache read. The AI also suggested `localStorage` over `sessionStorage`; we kept `sessionStorage` for tab-isolated sessions.
- Stopped the backend container, refreshed, confirmed user stayed logged in. Restarted and confirmed normal operation resumed. Tested with corrupted cache to verify graceful cleanup.

---

## Session 3: PostgreSQL Search — ILIKE vs. Full-Text Search

### Prompt (sent to ChatGPT)

> We need search on our tasks table by keyword (title/description) and by assignee name. Should we use LIKE, ILIKE, or full-text search with tsvector?

### AI Response (trimmed)

The AI recommended full-text search with a GIN index on the title column and provided the schema and query pattern:

```sql
CREATE INDEX idx_tasks_title ON tasks USING GIN (to_tsvector('english', title));

SELECT * FROM tasks WHERE to_tsvector('english', title) @@ to_tsquery('english', $1);
```

For the assignee search, it suggested a `JOIN` with `ILIKE` on the username.

### What Our Team Did With It

- The comparison helped us understand the trade-offs. We created the GIN index in `init.sql` as a demonstration of PostgreSQL indexing.
- The AI's `to_tsquery` requires formatted input with boolean operators — passing plain user input like `"fix login bug"` causes a syntax error. The AI didn't mention this. We used `ILIKE` with `%keyword%` instead, which handles arbitrary input without preprocessing.
- Tested via Postman with mixed-case input, empty parameters, and SQL injection attempts to confirm parameterized queries prevented injection.
