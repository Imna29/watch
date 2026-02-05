import { db } from "../../database/db";
import { user } from "../../database/schema";
import { count } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  try {
    const result = await db.select({ value: count() }).from(user);
    return {
      status: "success",
      message: "Database connection successful",
      userCount: result[0].value,
    };
  } catch (error: any) {
    return {
      status: "error",
      message: "Database connection failed",
      error: error.message,
    };
  }
});
