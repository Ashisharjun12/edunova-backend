import { db } from "../../config/database.js";
import { adminSettings } from "../../models/adminSettings.model.js";
import { eq } from "drizzle-orm";
import logger from "../../utils/logger.js";

const THEME_KEY = "color_theme";
const VALID_THEMES = ["blue", "green", "default", "orange", "red", "violet", "yellow"];
const VALID_MODES = ["light", "dark", "system"];

/**
 * Get current theme setting (public endpoint)
 */
export const getThemeSetting = async (req, res) => {
  try {
    const setting = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.key, THEME_KEY))
      .limit(1);

    if (setting.length === 0) {
      // Return default theme if not set
      return res.status(200).json({
        success: true,
        data: {
          colorTheme: "default",
          mode: "system",
        },
      });
    }

    const value = setting[0].value;
    return res.status(200).json({
      success: true,
      data: {
        colorTheme: value.colorTheme || "default",
        mode: value.mode || "system",
      },
    });
  } catch (error) {
    logger.error("Error getting theme setting:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get theme setting",
      error: error.message,
    });
  }
};

/**
 * Update theme setting (admin only)
 */
export const updateThemeSetting = async (req, res) => {
  try {
    const { colorTheme, mode } = req.body;
    const userId = req.user?.id;

    // Validate colorTheme
    if (!colorTheme || !VALID_THEMES.includes(colorTheme)) {
      return res.status(400).json({
        success: false,
        message: `Invalid colorTheme. Must be one of: ${VALID_THEMES.join(", ")}`,
      });
    }

    // Validate mode
    if (!mode || !VALID_MODES.includes(mode)) {
      return res.status(400).json({
        success: false,
        message: `Invalid mode. Must be one of: ${VALID_MODES.join(", ")}`,
      });
    }

    // Check if setting exists
    const existingSetting = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.key, THEME_KEY))
      .limit(1);

    const value = { colorTheme, mode };

    if (existingSetting.length === 0) {
      // Create new setting
      await db.insert(adminSettings).values({
        key: THEME_KEY,
        value,
        updatedBy: userId,
        updatedAt: new Date(),
        createdAt: new Date(),
      });
    } else {
      // Update existing setting
      await db
        .update(adminSettings)
        .set({
          value,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(adminSettings.key, THEME_KEY));
    }

    logger.info(`Theme setting updated by user ${userId}: ${colorTheme} / ${mode}`);

    return res.status(200).json({
      success: true,
      message: "Theme setting updated successfully",
      data: {
        colorTheme,
        mode,
      },
    });
  } catch (error) {
    logger.error("Error updating theme setting:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update theme setting",
      error: error.message,
    });
  }
};

