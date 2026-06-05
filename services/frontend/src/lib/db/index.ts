import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://nautos_user:nautos_dev_pass@localhost:5432/nautos";

// Pooled postgres client.
// - max: cap concurrent connections (must fit under Postgres max_connections)
// - idle_timeout: release idle conns after 20s
// - connect_timeout: fail fast if Postgres is unreachable
// - prepare: false plays nicer with pgBouncer / serverless deployments
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

export const db = drizzle(client);
