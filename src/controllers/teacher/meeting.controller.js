import { connection } from "../../config/database.js";
import jwt from "jsonwebtoken";
import { notifyCourseStudents } from "../../services/notification/notification.service.js";
import { broadcastMeetingStarted } from "../../services/announcement/announcementSSE.service.js";
import { publish } from "../../queue/pubsub.js";
import logger from "../../utils/logger.js";

// Jitsi Meet configuration
const JITSI_APP_ID = "academy";
const JITSI_APP_SECRET = "academy_secret";
const JITSI_DOMAIN = "meet.incampus.in";

// Generate Jitsi Meet JWT token
const generateJitsiToken = (user, roomName, isModerator = false) => {
  const now = Math.floor(Date.now() / 1000);
  
  // CRITICAL: Ensure moderator flag is explicitly set (never undefined)
  // Jitsi Meet will respect this flag to assign roles
  const moderatorFlag = Boolean(isModerator);
  
  const payload = {
    context: {
      user: {
        id: user.id,
        name: user.name || 'User',
        email: user.email || '',
        avatar: user.avatar || '',
        moderator: moderatorFlag, // Explicitly set moderator flag
      },
      features: {
        livestreaming: moderatorFlag, // Only moderators can livestream
        recording: moderatorFlag, // Only moderators can record
        transcription: false,
        "outbound-call": false,
      },
      group: roomName,
    },
    aud: JITSI_APP_ID,
    iss: JITSI_APP_ID,
    sub: JITSI_DOMAIN,
    room: roomName, // Room-locked: token only works for this specific room
    exp: now + (5 * 60), // 5 minutes expiry - SHORT-LIVED for security
    nbf: now - 10, // Not before 10 seconds ago
    iat: now, // Issued at
  };

  try {
    const token = jwt.sign(payload, JITSI_APP_SECRET, { 
      algorithm: "HS256",
      header: {
        alg: "HS256",
        typ: "JWT"
      }
    });
    console.log(`[generateJitsiToken] Room: ${roomName}, User: ${user.name}, Moderator: ${moderatorFlag}`);
    return token;
  } catch (error) {
    console.error('Error generating Jitsi token:', error);
    throw error;
  }
};

// Generate unique room name
const generateRoomName = (courseId, title) => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const sanitizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .substring(0, 30);
  return `${sanitizedTitle}-${courseId?.substring(0, 8)}-${randomStr}`;
};

// POST /api/v1/teacher/courses/:courseId/meetings - Create a meeting
export const createMeeting = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { courseId } = req.params;
    const { title, description, startTime, endTime, maxParticipants } = req.body;

    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!courseId || !title || !startTime) {
      return res.status(400).json({
        success: false,
        message: "courseId, title, and startTime are required",
      });
    }

    // Verify teacher owns the course
    const courseCheck = await connection`
      SELECT id, teacher_id, title as course_title FROM courses
      WHERE id = ${courseId} AND teacher_id = ${teacherId}
      LIMIT 1
    `;

    if (!courseCheck || courseCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to create meetings for this course",
      });
    }

    // Generate unique room name
    const roomName = generateRoomName(courseId, title);

    // Create meeting
    const [newMeeting] = await connection`
      INSERT INTO meetings (
        course_id,
        created_by,
        title,
        description,
        meeting_type,
        room_name,
        start_time,
        end_time,
        max_participants
      ) VALUES (
        ${courseId},
        ${teacherId},
        ${title},
        ${description || null},
        'course',
        ${roomName},
        ${new Date(startTime).toISOString()}::timestamp,
        ${endTime ? new Date(endTime).toISOString() : null}::timestamp,
        ${maxParticipants || null}
      )
      RETURNING *
    `;

    // Get user info for token generation
    const [userInfo] = await connection`
      SELECT id, name, email, avatar FROM users WHERE id = ${teacherId} LIMIT 1
    `;

    // Generate Jitsi token for creator (moderator)
    const token = generateJitsiToken(userInfo, roomName, true);

    const meetingUrl = `https://${JITSI_DOMAIN}/${roomName}`;

    // NOTE: Notifications are NOT sent when meeting is created
    // Notifications will be sent when teacher actually joins the meeting

    return res.status(201).json({
      success: true,
      message: "Meeting created successfully",
      data: {
        id: newMeeting.id,
        courseId: newMeeting.course_id,
        title: newMeeting.title,
        description: newMeeting.description,
        roomName: newMeeting.room_name,
        startTime: newMeeting.start_time,
        endTime: newMeeting.end_time,
        maxParticipants: newMeeting.max_participants,
        status: newMeeting.status,
        jitsiToken: token,
        jitsiDomain: JITSI_DOMAIN,
        meetingUrl: meetingUrl,
      },
    });
  } catch (error) {
    console.error("createMeeting error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create meeting",
    });
  }
};

// Invalidate cache after meeting creation
// Add this after the meeting is successfully created, before returning response
// Find the return statement in createMeeting and add cache invalidation before it

// GET /api/v1/teacher/courses/:courseId/meetings - Get all meetings for a course
export const getCourseMeetings = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { courseId } = req.params;

    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!courseId) {
      return res.status(400).json({ success: false, message: "courseId is required" });
    }

    // Verify teacher owns the course
    const courseCheck = await connection`
      SELECT id FROM courses WHERE id = ${courseId} AND teacher_id = ${teacherId} LIMIT 1
    `;

    if (!courseCheck || courseCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to access this course",
      });
    }

    // Get all meetings for the course
    const meetings = await connection`
      SELECT 
        m.*,
        u.name as created_by_name,
        u.email as created_by_email
      FROM meetings m
      LEFT JOIN users u ON u.id = m.created_by
      WHERE m.course_id = ${courseId}
      ORDER BY m.start_time DESC
    `;

    const formattedMeetings = meetings.map((meeting) => ({
      id: meeting.id,
      courseId: meeting.course_id,
      title: meeting.title,
      description: meeting.description,
      roomName: meeting.room_name,
      startTime: meeting.start_time,
      endTime: meeting.end_time,
      maxParticipants: meeting.max_participants,
      status: meeting.status,
      meetingType: meeting.meeting_type,
      createdBy: {
        id: meeting.created_by,
        name: meeting.created_by_name,
        email: meeting.created_by_email,
      },
      meetingUrl: `https://${JITSI_DOMAIN}/${meeting.room_name}`,
      createdAt: meeting.created_at,
      updatedAt: meeting.updated_at,
    }));

    return res.status(200).json({
      success: true,
      data: formattedMeetings,
    });
  } catch (error) {
    console.error("getCourseMeetings error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch meetings",
    });
  }
};

// GET /api/v1/auth/courses/:courseId/meetings/:meetingId/join - Join a meeting (student)
export const joinMeeting = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { courseId, meetingId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!courseId || !meetingId) {
      return res.status(400).json({
        success: false,
        message: "courseId and meetingId are required",
      });
    }

    // Check if user is enrolled in the course
    const enrollmentCheck = await connection`
      SELECT id FROM enrollments
      WHERE user_id = ${userId} AND course_id = ${courseId}
      LIMIT 1
    `;

    if (!enrollmentCheck || enrollmentCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You must be enrolled in this course to join meetings",
      });
    }

    // Get meeting details including creator info
    const [meeting] = await connection`
      SELECT m.*, c.teacher_id, m.created_by
      FROM meetings m
      LEFT JOIN courses c ON c.id = m.course_id
      WHERE m.id = ${meetingId} AND m.course_id = ${courseId}
      LIMIT 1
    `;

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    // Check if meeting is scheduled/live
    if (meeting.status === "ended" || meeting.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "This meeting has ended or been cancelled",
      });
    }

    // Get user info including role
    const [userInfo] = await connection`
      SELECT id, name, email, avatar, role FROM users WHERE id = ${userId} LIMIT 1
    `;

    // CRITICAL: Only the meeting creator becomes moderator, regardless of join order
    // This ensures:
    // 1. Meeting creator (course teacher) is ALWAYS moderator (even if they join last)
    // 2. All other users (students, other teachers) are ALWAYS participants (even if they join first)
    // 3. Students can NEVER become moderators, even if they join first
    const isMeetingCreator = meeting.created_by === userId;
    const userRole = userInfo?.role || req.user?.role;
    
    // Only meeting creator gets moderator role
    // Double-check: user must be meeting creator AND have teacher/admin role
    const isModerator = isMeetingCreator && (userRole === 'teacher' || userRole === 'admin');

    console.log(`[joinMeeting] User ${userId} (${userRole}) joining meeting ${meetingId}`);
    console.log(`[joinMeeting] Meeting creator: ${meeting.created_by}, Current user: ${userId}`);
    console.log(`[joinMeeting] Is meeting creator: ${isMeetingCreator}, Will be moderator: ${isModerator}`);

    // Generate Jitsi token with correct moderator flag
    const token = generateJitsiToken(userInfo, meeting.room_name, isModerator);

    // Record participant join (upsert)
    const roleValue = isModerator ? "moderator" : "participant";
    await connection`
      INSERT INTO meeting_participants (meeting_id, user_id, role, is_active, joined_at)
      VALUES (${meetingId}, ${userId}, ${roleValue}, true, NOW())
      ON CONFLICT (meeting_id, user_id) DO UPDATE
      SET is_active = true, joined_at = NOW(), left_at = NULL, role = ${roleValue}
    `;

    return res.status(200).json({
      success: true,
      data: {
        meetingId: meeting.id,
        roomName: meeting.room_name,
        title: meeting.title,
        jitsiToken: token,
        jitsiDomain: JITSI_DOMAIN,
        meetingUrl: `https://${JITSI_DOMAIN}/${meeting.room_name}`,
        role: isModerator ? "moderator" : "participant",
      },
    });
  } catch (error) {
    console.error("joinMeeting error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to join meeting",
    });
  }
};

// GET /api/v1/auth/courses/:courseId/meetings - Get meetings for enrolled course (student)
export const getCourseMeetingsForStudent = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!courseId) {
      return res.status(400).json({ success: false, message: "courseId is required" });
    }

    // Check if user is enrolled
    const enrollmentCheck = await connection`
      SELECT id FROM enrollments
      WHERE user_id = ${userId} AND course_id = ${courseId}
      LIMIT 1
    `;

    if (!enrollmentCheck || enrollmentCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You must be enrolled in this course to view meetings",
      });
    }

    // Get meetings for the course
    const meetings = await connection`
      SELECT 
        m.*,
        u.name as created_by_name
      FROM meetings m
      LEFT JOIN users u ON u.id = m.created_by
      WHERE m.course_id = ${courseId}
        AND m.status IN ('scheduled', 'live')
      ORDER BY m.start_time ASC
    `;

    return res.status(200).json({
      success: true,
      data: meetings.map((meeting) => ({
        id: meeting.id,
        title: meeting.title,
        description: meeting.description,
        startTime: meeting.start_time,
        endTime: meeting.end_time,
        status: meeting.status,
        roomName: meeting.room_name,
        createdBy: {
          name: meeting.created_by_name,
        },
        meetingUrl: `https://${JITSI_DOMAIN}/${meeting.room_name}`,
      })),
    });
  } catch (error) {
    console.error("getCourseMeetingsForStudent error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch meetings",
    });
  }
};

// GET /api/v1/teacher/courses/:courseId/meetings/:meetingId/join - Join a meeting (teacher)
export const joinMeetingAsTeacher = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { courseId, meetingId } = req.params;

    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!courseId || !meetingId) {
      return res.status(400).json({
        success: false,
        message: "courseId and meetingId are required",
      });
    }

    // Verify teacher owns the course
    const courseCheck = await connection`
      SELECT id, teacher_id FROM courses
      WHERE id = ${courseId} AND teacher_id = ${teacherId}
      LIMIT 1
    `;

    if (!courseCheck || courseCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to join meetings for this course",
      });
    }

    // Get meeting details including creator info
    const [meeting] = await connection`
      SELECT m.*, m.created_by FROM meetings m
      WHERE m.id = ${meetingId} AND m.course_id = ${courseId}
      LIMIT 1
    `;

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    // Check if meeting is scheduled/live
    if (meeting.status === "ended" || meeting.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "This meeting has ended or been cancelled",
      });
    }

    // Get user info
    const [userInfo] = await connection`
      SELECT id, name, email, avatar, role FROM users WHERE id = ${teacherId} LIMIT 1
    `;

    // CRITICAL: Only the meeting creator becomes moderator
    // This ensures that even if the teacher joins late, they'll be moderator
    // and if they're not the creator, they'll be participant
    const isMeetingCreator = meeting.created_by === teacherId;
    const userRole = userInfo?.role || req.user?.role;
    
    // Only meeting creator gets moderator role (must be teacher/admin AND creator)
    const isModerator = isMeetingCreator && (userRole === 'teacher' || userRole === 'admin');

    console.log(`[joinMeetingAsTeacher] Teacher ${teacherId} (${userRole}) joining meeting ${meetingId}`);
    console.log(`[joinMeetingAsTeacher] Meeting creator: ${meeting.created_by}, Current teacher: ${teacherId}`);
    console.log(`[joinMeetingAsTeacher] Is meeting creator: ${isMeetingCreator}, Will be moderator: ${isModerator}`);

    // Generate Jitsi token
    const token = generateJitsiToken(userInfo, meeting.room_name, isModerator);

    // Check if this is the first time teacher is joining (to avoid duplicate notifications)
    const existingParticipant = await connection`
      SELECT joined_at FROM meeting_participants
      WHERE meeting_id = ${meetingId} AND user_id = ${teacherId}
      LIMIT 1
    `;

    const isFirstJoin = !existingParticipant || existingParticipant.length === 0 || !existingParticipant[0]?.joined_at;

    // Record participant join (upsert)
    // Use COALESCE to preserve existing joined_at if it exists
    await connection`
      INSERT INTO meeting_participants (meeting_id, user_id, role, is_active, joined_at)
      VALUES (${meetingId}, ${teacherId}, 'moderator', true, NOW())
      ON CONFLICT (meeting_id, user_id) DO UPDATE
      SET is_active = true, 
          joined_at = CASE 
            WHEN meeting_participants.joined_at IS NULL THEN NOW()
            ELSE meeting_participants.joined_at
          END,
          left_at = NULL, 
          role = 'moderator'
    `;

    // Only send notifications if teacher is the creator AND it's their first join
    if (isMeetingCreator && isFirstJoin) {
      try {
        // Get course title
        const [courseInfo] = await connection`
          SELECT title FROM courses WHERE id = ${courseId} LIMIT 1
        `;
        const courseTitle = courseInfo?.title || 'Course';

        const meetingUrl = `https://${JITSI_DOMAIN}/${meeting.room_name}`;

        // Notify enrolled students about the meeting/class starting
        // NOTE: This creates a NOTIFICATION with type 'meeting_started'
        await notifyCourseStudents(
          courseId,
          'meeting_started', // Notification type - appears in notification bell
          `Class Started: ${meeting.title}`,
          `A live class "${meeting.title}" has started for ${courseTitle}. Join now!`,
          { 
            meetingId: meeting.id,
            meetingUrl: meetingUrl,
            roomName: meeting.room_name,
            courseTitle: courseTitle
          }
        );

        // Publish to Redis pub/sub for scalable SSE (works across multiple instances)
        const meetingData = {
          meetingId: meeting.id,
          title: meeting.title,
          meetingUrl: meetingUrl,
          roomName: meeting.room_name,
          courseTitle: courseTitle
        };
        
        try {
          const channel = `announcement:course:${courseId}`;
          await publish(channel, {
            courseId,
            meetingData,
            type: 'meeting_started',
            timestamp: new Date().toISOString(),
          });
          logger.debug(`Published meeting started to Redis pub/sub channel ${channel} for course ${courseId}`);
        } catch (pubSubError) {
          logger.error(`Error publishing meeting to Redis pub/sub for course ${courseId}:`, pubSubError);
          // Still try to broadcast locally even if pub/sub fails
          try {
            broadcastMeetingStarted(courseId, meetingData);
          } catch (sseError) {
            logger.error('Error broadcasting meeting via SSE:', sseError);
          }
        }
      } catch (notificationError) {
        console.error('Error sending meeting notifications:', notificationError);
        // Don't fail the request if notifications fail
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        meetingId: meeting.id,
        roomName: meeting.room_name,
        title: meeting.title,
        jitsiToken: token,
        jitsiDomain: JITSI_DOMAIN,
        meetingUrl: `https://${JITSI_DOMAIN}/${meeting.room_name}`,
        role: "moderator",
      },
    });
  } catch (error) {
    console.error("joinMeetingAsTeacher error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to join meeting",
    });
  }
};

// DELETE /api/v1/teacher/courses/:courseId/meetings/:meetingId - Delete a meeting
export const deleteMeeting = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { courseId, meetingId } = req.params;

    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Verify teacher owns the course and meeting
    const meetingCheck = await connection`
      SELECT m.id FROM meetings m
      JOIN courses c ON c.id = m.course_id
      WHERE m.id = ${meetingId} 
        AND m.course_id = ${courseId}
        AND c.teacher_id = ${teacherId}
      LIMIT 1
    `;

    if (!meetingCheck || meetingCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found or you don't have permission",
      });
    }

    // Delete meeting (cascade will delete participants)
    await connection`
      DELETE FROM meetings WHERE id = ${meetingId}
    `;

    return res.status(200).json({
      success: true,
      message: "Meeting deleted successfully",
    });
  } catch (error) {
    console.error("deleteMeeting error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete meeting",
    });
  }
};

