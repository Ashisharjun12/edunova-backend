import { db } from "../config/database.js";

export const transaction = async (callback) => {
  try {
    return await db.transaction(async (tx) => {
      return await callback(tx);
    });
  } catch (error) {
    console.error("Transaction failed:", error);
    throw error;
  }
};
