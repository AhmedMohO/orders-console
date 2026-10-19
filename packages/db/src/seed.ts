import { createDb } from "./client.js";
import { users } from "./schema/users.js";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const db = createDb(dbUrl);

async function seed() {
  console.log("Seeding users into the database...");

  const sampleUsers = [
    { name: "Alice Johnson", email: "alice@example.com" },
    { name: "Bob Smith", email: "bob@example.com" },
    { name: "Charlie Brown", email: "charlie@example.com" },
    { name: "Diana Prince", email: "diana@example.com" },
  ];

  for (const user of sampleUsers) {
    await db
      .insert(users)
      .values(user)
      .onConflictDoNothing({ target: users.email });
  }

  const allUsers = await db.select().from(users);
  console.log(`Database seeded successfully! Current users in DB (${allUsers.length}):`);
  console.table(allUsers);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Failed to seed database:", err);
  process.exit(1);
});
