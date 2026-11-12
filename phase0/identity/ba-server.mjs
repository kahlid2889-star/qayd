// Standalone Better Auth instance used ONLY for the Phase 0 identity spike.
// It is not the game's auth: separate schema ("ba") in the LOCAL test database,
// no production secrets, nothing imported from the game.
import http from "node:http";
import pg from "pg";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { toNodeHandler } from "better-auth/node";
import { getMigrations } from "better-auth/db/migration";

export const PORT = Number(process.env.BA_PORT || 3999);
export const ISSUER = process.env.BA_ISSUER || `http://127.0.0.1:${PORT}`;
const DB = process.env.LOCAL_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = new pg.Client({ connectionString: DB });
await admin.connect();
await admin.query("create schema if not exists ba");
await admin.end();

const pool = new pg.Pool({ connectionString: DB, options: "-c search_path=ba" });
export const auth = betterAuth({
  baseURL: ISSUER,
  secret: "phase0-local-only-secret-not-used-anywhere-else-123456",
  database: pool,
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  trustedOrigins: [ISSUER],
  plugins: [
    jwt({
      jwks: { keyPairConfig: { alg: "ES256" } },
      jwt: {
        issuer: ISSUER,
        audience: "authenticated",
        expirationTime: "1h",
        // What Supabase needs: role=authenticated, sub = our (non-UUID) user id.
        definePayload: ({ user }) => ({ role: "authenticated", email: user.email, name: user.name }),
        getSubject: ({ user }) => user.id,
      },
    }),
  ],
});
const { runMigrations } = await getMigrations(auth.options);
await runMigrations();

const handler = toNodeHandler(auth);
const server = http.createServer((req, res) => {
  if (req.url === "/.well-known/openid-configuration") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      issuer: ISSUER,
      jwks_uri: `${ISSUER}/api/auth/jwks`,
      id_token_signing_alg_values_supported: ["ES256"],
      subject_types_supported: ["public"],
      response_types_supported: ["id_token"],
    }));
    return;
  }
  return handler(req, res);
});
server.listen(PORT, process.env.BA_HOST || "127.0.0.1", () => console.log("ba-server ready", ISSUER));
