import logger from "../../utils/logger.js";
import { _config } from "../../config/config.js";
import passport from 'passport';
import { db } from '../../config/database.js';
import { users } from '../../models/user.model.js';
import { courses } from '../../models/course.model.js';
import { enrollments } from '../../models/enrollement.model.js';
import { images } from '../../models/document.model.js';
import { eq, or, desc } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

// Helper function to generate access token
const generateAccessToken = (user) => {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, type: 'access' },
    _config.JWT_SECRET || 'your-jwt-secret',
    { expiresIn: '15m' } 
  );
  logger.info(`Generated access token for user: ${user.email}`);
  return token;
};

// Helper function to generate refresh token
const generateRefreshToken = (user) => {
  const token = jwt.sign(
    { id: user.id, email: user.email, type: 'refresh' },
    _config.JWT_REFRESH_SECRET || _config.JWT_SECRET || 'your-refresh-secret',
    { expiresIn: '7d' } // Long-lived refresh token
  );
  logger.info(`Generated refresh token for user: ${user.email}`);
  return token;
};

// Helper function to generate both tokens
const generateTokens = (user) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  return { accessToken, refreshToken };
};

// Google OAuth Login - Initiates Google OAuth flow
export const googleLogin = (req, res, next) => {
  try {
    logger.info("Initiating Google OAuth login...");
    
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false
    })(req, res, next);
  } catch (error) {
    logger.error("Google login initiation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to initiate Google login"
    });
  }
};

// Google OAuth Callback - Handles the callback from Google
export const googleCallback = (req, res, next) => {
  try {
    logger.info("Processing Google OAuth callback...");
    
    passport.authenticate('google', {
      session: false,
      failureRedirect: `${_config.FRONTEND_URL || _config.DOMAIN_URL}/auth?error=auth_failed`
    })(req, res, (err) => {
      if (err) {
        logger.error("Google callback error:", err);
        return res.redirect(`${_config.FRONTEND_URL || _config.DOMAIN_URL}/auth?error=auth_failed`);
      }

      if (!req.user) {
        logger.error("No user found in Google callback");
        return res.redirect(`${_config.FRONTEND_URL || _config.DOMAIN_URL}/auth?error=no_user`);
      }

      // Generate both tokens
      const { accessToken, refreshToken } = generateTokens(req.user);
      
      // Set JWT tokens as httpOnly cookies
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        maxAge: 1000 * 60 * 15, // 15 minutes
        path: '/'
      });
      
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        path: '/'
      });

      logger.info("Google login successful for user:", req.user.email);
      
      // Redirect to frontend with success
      res.redirect(`${_config.FRONTEND_URL || _config.DOMAIN_URL}/auth/callback?token=${accessToken}`);
    });
  } catch (error) {
    logger.error("Google callback processing error:", error);
    res.redirect(`${_config.FRONTEND_URL || _config.DOMAIN_URL}/auth?error=server_error`);
  }
};


// Logout User - Clears JWT cookies and logs out user
export const logoutUser = async (req, res) => {
  try {
    logger.info("User logout initiated...");
    
    // Clear both JWT cookies
    res.clearCookie("accessToken", {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: 0,
      path: '/'
    });
    
    res.clearCookie("refreshToken", {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: 0,
      path: '/'
    });

    logger.info("User logged out successfully");
    
    res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });
  } catch (error) {
    logger.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Logout failed due to an internal server error"
    });
  }
};

// Refresh Token - Generate new access token using refresh token
export const refreshToken = async (req, res) => {
  try {
    logger.info("Refresh token request initiated...");
    
    // Get refresh token from cookie or Authorization header
    let refreshToken = req.cookies?.refreshToken;
    
    if (!refreshToken && req.headers.authorization) {
      refreshToken = req.headers.authorization.split(' ')[1];
    }

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken, 
      _config.JWT_REFRESH_SECRET || _config.JWT_SECRET || 'your-refresh-secret'
    );
    
    // Check if it's a refresh token
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type'
      });
    }

    // Get user from database
    const [user] = await db.select().from(users).where(eq(users.id, decoded.id));
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user);
    
    // Set new access token cookie
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: 1000 * 60 * 15, // 15 minutes
      path: '/'
    });

    logger.info("New access token generated for user:", user.email);
    
    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      accessToken: newAccessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        collegeName: user.collegeName
      }
    });
  } catch (error) {
    logger.error("Refresh token error:", error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token expired, please login again'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Token refresh failed'
    });
  }
};

// Check User - Check if user is authenticated
export const checkUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated"
      });
    }

    logger.info("User check successful for:", req.user.email);
    
    res.status(200).json({
      success: true,
      message: "User is authenticated",
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        avatar: req.user.avatar,
        bio: req.user.bio,
        collegeName: req.user.collegeName,
        collegeId: req.user.collegeId
      }
    });
  } catch (error) {
    logger.error("Check user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check user"
    });
  }
};

// Get Logged In User - Returns current user info
export const getLoggedInUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated"
      });
    }

    logger.info("Get user info for:", req.user.email);
    
    res.status(200).json({
      success: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        avatar: req.user.avatar,
        bio: req.user.bio,
        collegeName: req.user.collegeName,
        collegeId: req.user.collegeId,
        socialLinks: req.user.socialLinks,
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    logger.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user information"
    });
  }
};

// Upload Avatar - Upload user avatar
export const uploadAvatar = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated"
      });
    }

    // Handle file upload logic here
    // You'll need to implement multer middleware
    
    logger.info("Avatar upload for user:", req.user.email);
    
    res.status(200).json({
      success: true,
      message: "Avatar uploaded successfully"
    });
  } catch (error) {
    logger.error("Avatar upload error:", error);
    res.status(500).json({
      success: false,
      message: "Avatar upload failed"
    });
  }
};

// Get User Details API - Get user details by ID
export const getUserDetailsApi = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    logger.info("User details requested for:", user.email);
    
    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        collegeName: user.collegeName,
        collegeId: user.collegeId,
        socialLinks: user.socialLinks,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    logger.error("Get user details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user details"
    });
  }
};

// Get User Statistics - Get user statistics
export const getUserStatistics = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated"
      });
    }

    // Implement user statistics logic here
    // This could include course enrollments, progress, etc.
    
    logger.info("User statistics requested for:", req.user.email);
    
    res.status(200).json({
      success: true,
      statistics: {
        totalCourses: 0,
        completedCourses: 0,
        inProgressCourses: 0,
        totalLessons: 0,
        completedLessons: 0
      }
    });
  } catch (error) {
    logger.error("Get user statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user statistics"
    });
  }
};

// Get user enrolled courses
export const getUserCourses = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    logger.info(`Getting enrolled courses for user: ${userId}`);

    // Get user's enrollments with course details
    const userEnrollments = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.userId, userId))
      .orderBy(desc(enrollments.createdAt));

    logger.info(`Found ${userEnrollments.length} enrollments for user ${userId}`);

    // Get course details for each enrollment
    const enrolledCourses = [];
    for (const enrollment of userEnrollments) {
      try {
        // Get course details
        const courseData = await db
          .select()
          .from(courses)
          .where(eq(courses.id, enrollment.courseId))
          .limit(1);

        if (courseData.length === 0) continue;

        const course = courseData[0];

        // Get thumbnail if exists
        let thumbnailUrl = null;
        if (course.thumbnailId) {
          const thumbnailData = await db
            .select()
            .from(images)
            .where(eq(images.id, course.thumbnailId))
            .limit(1);
          
          if (thumbnailData.length > 0) {
            thumbnailUrl = thumbnailData[0].url;
          }
        }

        enrolledCourses.push({
          id: course.id,
          title: course.title,
          description: course.description,
          shortDescription: course.shortDescription,
          price: course.price,
          status: course.status,
          studentCount: course.studentCount,
          createdAt: course.createdAt,
          tags: course.tags || [],
          thumbnailUrl: thumbnailUrl,
          // Enrollment specific data
          enrollmentId: enrollment.id,
          progressPercent: enrollment.progressPercent || 0,
          enrolledAt: enrollment.createdAt,
          lastAccessedAt: enrollment.updatedAt
        });
      } catch (error) {
        logger.error(`Error fetching course ${enrollment.courseId}:`, error);
        continue;
      }
    }

    res.status(200).json({
      success: true,
      data: enrolledCourses,
      count: enrolledCourses.length
    });

  } catch (error) {
    logger.error("Get user courses error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user courses",
      error: error.message
    });
  }
};

// Update user profile
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, bio, collegeName, collegeId } = req.body;

    logger.info(`Updating profile for user: ${userId}`);

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required"
      });
    }

    // Update user profile
    const updatedUser = await db
      .update(users)
      .set({
        name,
        bio: bio || null,
        collegeName: collegeName || null,
        collegeId: collegeId || null,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        bio: users.bio,
        collegeName: users.collegeName,
        collegeId: users.collegeId,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt
      });

    if (updatedUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    logger.info(`Profile updated successfully for user: ${userId}`);

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser[0]
    });

  } catch (error) {
    logger.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message
    });
  }
};