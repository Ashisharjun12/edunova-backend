import { connection } from "../../config/database.js";
import { getCachedCourseEvents, cacheCourseEvents, invalidateCourseEventsCache } from "../../services/redis/cache.service.js";
import logger from "../../utils/logger.js";

// GET /api/v1/auth/courses/:courseId/events - Get all events for a course
export const getCourseEvents = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    
    if (!courseId) {
      return res.status(400).json({ success: false, message: "courseId is required" });
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
        message: "Not enrolled in this course" 
      });
    }

    // Check cache first
    const cachedEvents = await getCachedCourseEvents(courseId);
    if (cachedEvents) {
      logger.info(`Cache hit for course events: ${courseId}`);
      return res.status(200).json({
        success: true,
        data: cachedEvents,
      });
    }

    logger.debug(`Cache miss for course events: ${courseId}, fetching from database`);

    // Get all events for the course, including standalone events linked to lessons in this course
    const events = await connection`
      SELECT DISTINCT
        ce.*,
        u.name as created_by_name,
        u.email as created_by_email
      FROM course_events ce
      LEFT JOIN users u ON u.id = ce.created_by
      LEFT JOIN lessons l ON l.linked_event_id = ce.id
      WHERE ce.course_id = ${courseId}
         OR (ce.course_id IS NULL AND l.course_id = ${courseId})
      ORDER BY ce.start ASC
    `;

    // Format events for frontend
    const formattedEvents = events.map(event => ({
      id: event.id,
      title: event.title,
      description: event.description || '',
      start: new Date(event.start),
      end: new Date(event.end),
      allDay: event.all_day || false,
      location: event.location || '',
      meetingLink: event.meeting_link || null,
      color: event.color || 'sky',
      createdBy: {
        id: event.created_by,
        name: event.created_by_name,
        email: event.created_by_email,
      },
      createdAt: event.created_at,
      updatedAt: event.updated_at,
    }));

    // Cache the events before returning
    await cacheCourseEvents(courseId, formattedEvents);
    logger.info(`Cached course events for ${courseId}`);

    return res.status(200).json({
      success: true,
      data: formattedEvents,
    });
  } catch (error) {
    logger.error("getCourseEvents error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to fetch course events" 
    });
  }
};

// POST /api/v1/auth/courses/:courseId/events - Create a new event (admin/teacher only)
export const createCourseEvent = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { courseId } = req.params;
    const { title, description, start, end, allDay, location, meetingLink, color } = req.body;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    
    // Only admin and teacher can create events
    if (!['admin', 'teacher'].includes(userRole)) {
      return res.status(403).json({ 
        success: false, 
        message: "Only admins and teachers can create events" 
      });
    }
    
    if (!courseId || !title || !start || !end) {
      return res.status(400).json({ 
        success: false, 
        message: "courseId, title, start, and end are required" 
      });
    }

    // Verify course exists
    const courseCheck = await connection`
      SELECT id FROM courses WHERE id = ${courseId} LIMIT 1
    `;

    if (!courseCheck || courseCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Course not found" 
      });
    }

    // Create event
    const newEvent = await connection`
      INSERT INTO course_events (
        course_id,
        created_by,
        title,
        description,
        start,
        "end",
        all_day,
        location,
        meeting_link,
        color
      ) VALUES (
        ${courseId},
        ${userId},
        ${title},
        ${description || null},
        ${start},
        ${end},
        ${allDay || false},
        ${location || null},
        ${meetingLink || null},
        ${color || 'sky'}
      )
      RETURNING *
    `;

    return res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: {
        id: newEvent[0].id,
        title: newEvent[0].title,
        description: newEvent[0].description,
        start: newEvent[0].start,
        end: newEvent[0].end,
        allDay: newEvent[0].all_day,
        location: newEvent[0].location,
        meetingLink: newEvent[0].meeting_link,
        color: newEvent[0].color,
      },
    });
  } catch (error) {
    console.error("createCourseEvent error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to create event" 
    });
  }
};

// PUT /api/v1/auth/courses/:courseId/events/:eventId - Update an event (admin/teacher only)
export const updateCourseEvent = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { courseId, eventId } = req.params;
    const { title, description, start, end, allDay, location, meetingLink, color } = req.body;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    
    // Only admin and teacher can update events
    if (!['admin', 'teacher'].includes(userRole)) {
      return res.status(403).json({ 
        success: false, 
        message: "Only admins and teachers can update events" 
      });
    }

    // Check if event exists and belongs to the course
    const eventCheck = await connection`
      SELECT id, created_by FROM course_events 
      WHERE id = ${eventId} AND course_id = ${courseId} 
      LIMIT 1
    `;

    if (!eventCheck || eventCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Event not found" 
      });
    }

    // Update event
    const updatedEvent = await connection`
      UPDATE course_events
      SET 
        title = COALESCE(${title}, title),
        description = COALESCE(${description}, description),
        start = COALESCE(${start}, start),
        "end" = COALESCE(${end}, "end"),
        all_day = COALESCE(${allDay}, all_day),
        location = COALESCE(${location}, location),
        meeting_link = COALESCE(${meetingLink}, meeting_link),
        color = COALESCE(${color}, color),
        updated_at = NOW()
      WHERE id = ${eventId} AND course_id = ${courseId}
      RETURNING *
    `;

    // Invalidate events cache
    await invalidateCourseEventsCache(courseId);
    logger.info(`Invalidated events cache for course ${courseId} after updating event`);

    return res.status(200).json({
      success: true,
      message: "Event updated successfully",
      data: {
        id: updatedEvent[0].id,
        title: updatedEvent[0].title,
        description: updatedEvent[0].description,
        start: updatedEvent[0].start,
        end: updatedEvent[0].end,
        allDay: updatedEvent[0].all_day,
        location: updatedEvent[0].location,
        meetingLink: updatedEvent[0].meeting_link,
        color: updatedEvent[0].color,
      },
    });
  } catch (error) {
    console.error("updateCourseEvent error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to update event" 
    });
  }
};

// DELETE /api/v1/auth/courses/:courseId/events/:eventId - Delete an event (admin/teacher only)
export const deleteCourseEvent = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { courseId, eventId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    
    // Only admin and teacher can delete events
    if (!['admin', 'teacher'].includes(userRole)) {
      return res.status(403).json({ 
        success: false, 
        message: "Only admins and teachers can delete events" 
      });
    }

    // Check if event exists and belongs to the course
    const eventCheck = await connection`
      SELECT id FROM course_events 
      WHERE id = ${eventId} AND course_id = ${courseId} 
      LIMIT 1
    `;

    if (!eventCheck || eventCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Event not found" 
      });
    }

    // Delete event
    await connection`
      DELETE FROM course_events
      WHERE id = ${eventId} AND course_id = ${courseId}
    `;

    // Invalidate events cache
    await invalidateCourseEventsCache(courseId);
    logger.info(`Invalidated events cache for course ${courseId} after deleting event`);

    return res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("deleteCourseEvent error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to delete event" 
    });
  }
};

