
import { eq } from "drizzle-orm";
import { _config } from "../config/config.js";
import { db } from "../config/database.js";
import { users } from "../models/user.model.js";
import logger from "../utils/logger.js";
import jwt from "jsonwebtoken"

export const authenticate = async (req, res, next) => {
  let token = null;
  console.log("cookies:", req.cookies);
  
  // Check for access token in cookies or Authorization header
  if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  } else if (req.headers?.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  
  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: "Access token required" 
    });
  }
  
  // Verify access token
  try {
    const decoded = jwt.verify(token, _config.JWT_SECRET);
    logger.info(`Decoded access token User: ${JSON.stringify(decoded)}`);

    // Check if it's an access token
    if (decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        message: "Invalid token type"
      });
    }

    // Find user
    const finduser = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.id));

    if (finduser.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - User not found",
      });
    }
    req.user = finduser[0];

    next();
  } catch (error) {
    logger.error("Authentication error:", error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: "Access token expired, please refresh",
        code: "TOKEN_EXPIRED"
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: "Invalid access token",
        code: "INVALID_TOKEN"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Authentication failed"
    });
  }
};