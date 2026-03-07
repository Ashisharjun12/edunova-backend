import { connection } from "../../config/database.js";

// GET /api/v1/teacher/events - Get all events for a teacher (including standalone events)
export const getTeacherEvents = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    
    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Get all events created by the teacher (including standalone and course events)
    const events = await connection`
      SELECT 
        ce.*,
        u.name as created_by_name,
        u.email as created_by_email,
        c.title as course_title
      FROM course_events ce
      LEFT JOIN users u ON u.id = ce.created_by
      LEFT JOIN courses c ON c.id = ce.course_id
      WHERE ce.created_by = ${teacherId}
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
      courseId: event.course_id,
      courseTitle: event.course_title || null,
      createdBy: {
        id: event.created_by,
        name: event.created_by_name,
        email: event.created_by_email,
      },
      createdAt: event.created_at,
      updatedAt: event.updated_at,
    }));

    return res.status(200).json({
      success: true,
      data: formattedEvents,
    });
  } catch (error) {
    console.error("getTeacherEvents error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to fetch events" 
    });
  }
};

// GET /api/v1/teacher/courses/:courseId/events - Get all events for a course (teacher only)
export const getTeacherCourseEvents = async (req, res) => {
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
      SELECT id, teacher_id FROM courses 
      WHERE id = ${courseId} AND teacher_id = ${teacherId} 
      LIMIT 1
    `;

    if (!courseCheck || courseCheck.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: "You don't have permission to access this course" 
      });
    }

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

    return res.status(200).json({
      success: true,
      data: formattedEvents,
    });
  } catch (error) {
    console.error("getTeacherCourseEvents error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to fetch course events" 
    });
  }
};

// POST /api/v1/teacher/events - Create a standalone event (not associated with any course)
export const createTeacherEvent = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { title, description, start, end, allDay, location, meetingLink, color } = req.body;
    
    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    
    if (!title || !start || !end) {
      return res.status(400).json({ 
        success: false, 
        message: "title, start, and end are required" 
      });
    }

    // Convert date strings to ISO strings for postgres-js
    const startDateStr = start instanceof Date ? start.toISOString() : start;
    const endDateStr = end instanceof Date ? end.toISOString() : end;

    // Validate dates
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format"
      });
    }

    // Create standalone event (courseId is null)
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
        NULL,
        ${teacherId},
        ${title},
        ${description || null},
        ${startDateStr}::timestamp,
        ${endDateStr}::timestamp,
        ${allDay || false},
        ${location || null},
        ${meetingLink || null},
        ${color || 'sky'}
      )
      RETURNING *
    `;

    // Get user info for createdBy
    const [userInfo] = await connection`
      SELECT id, name, email FROM users WHERE id = ${teacherId} LIMIT 1
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
        courseId: newEvent[0].course_id,
        createdBy: userInfo ? {
          id: userInfo.id,
          name: userInfo.name,
          email: userInfo.email,
        } : null,
      },
    });
  } catch (error) {
    console.error("createTeacherEvent error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to create event" 
    });
  }
};

// POST /api/v1/teacher/courses/:courseId/events - Create a new event (teacher only)
export const createTeacherCourseEvent = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { courseId } = req.params;
    const { title, description, start, end, allDay, location, meetingLink, color } = req.body;
    
    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    
    if (!courseId || !title || !start || !end) {
      return res.status(400).json({ 
        success: false, 
        message: "courseId, title, start, and end are required" 
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
        message: "You don't have permission to create events for this course" 
      });
    }

    // Convert date strings to ISO strings for postgres-js
    const startDateStr = start instanceof Date ? start.toISOString() : start;
    const endDateStr = end instanceof Date ? end.toISOString() : end;

    // Validate dates
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format"
      });
    }

    // Create event - use ISO string format for dates
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
        ${teacherId},
        ${title},
        ${description || null},
        ${startDateStr}::timestamp,
        ${endDateStr}::timestamp,
        ${allDay || false},
        ${location || null},
        ${meetingLink || null},
        ${color || 'sky'}
      )
      RETURNING *
    `;

    // Get user info for createdBy
    const [userInfo] = await connection`
      SELECT id, name, email FROM users WHERE id = ${teacherId} LIMIT 1
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
        courseId: newEvent[0].course_id,
        createdBy: userInfo ? {
          id: userInfo.id,
          name: userInfo.name,
          email: userInfo.email,
        } : null,
      },
    });
  } catch (error) {
    console.error("createTeacherCourseEvent error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to create event" 
    });
  }
};

// PUT /api/v1/teacher/events/:eventId/assign-course - Assign a standalone event to a course
export const assignEventToCourse = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { eventId } = req.params;
    const { courseId } = req.body;
    
    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    
    if (!eventId || !courseId) {
      return res.status(400).json({
        success: false,
        message: "eventId and courseId are required"
      });
    }

    // Verify teacher owns the event
    const eventCheck = await connection`
      SELECT id, course_id, created_by FROM course_events 
      WHERE id = ${eventId} AND created_by = ${teacherId} 
      LIMIT 1
    `;

    if (!eventCheck || eventCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you don't have permission"
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
        message: "You don't have permission to assign events to this course"
      });
    }

    // Update event to assign it to the course
    const updatedEvent = await connection`
      UPDATE course_events
      SET 
        course_id = ${courseId},
        updated_at = NOW()
      WHERE id = ${eventId} AND created_by = ${teacherId}
      RETURNING *
    `;

    if (!updatedEvent || updatedEvent.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found after update"
      });
    }

    // Invalidate caches
    await invalidateTeacherEventsCache(teacherId);
    await invalidateTeacherCourseEventsCache(courseId);

    return res.status(200).json({
      success: true,
      message: "Event assigned to course successfully",
      data: {
        id: updatedEvent[0].id,
        title: updatedEvent[0].title,
        courseId: updatedEvent[0].course_id,
      },
    });
  } catch (error) {
    console.error("assignEventToCourse error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to assign event to course"
    });
  }
};

// PUT /api/v1/teacher/courses/:courseId/events/:eventId - Update an event (teacher only)
// PUT /api/v1/teacher/events/:eventId - Update a standalone event (when courseId is null)
export const updateTeacherCourseEvent = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { courseId, eventId } = req.params;
    const { title, description, start, end, allDay, location, meetingLink, color } = req.body;
    
    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Check if event exists and teacher owns it
    const eventCheck = await connection`
      SELECT id, course_id, created_by FROM course_events 
      WHERE id = ${eventId} AND created_by = ${teacherId} 
      LIMIT 1
    `;

    if (!eventCheck || eventCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Event not found or you don't have permission" 
      });
    }

    const eventCourseId = eventCheck[0].course_id;

    // If courseId is provided in params, verify it matches the event's courseId
    // If event is standalone (courseId is null), allow update without course verification
    if (courseId && eventCourseId && courseId !== eventCourseId) {
      return res.status(403).json({
        success: false,
        message: "Event does not belong to the specified course"
      });
    }

    // If courseId is provided and event has a course, verify teacher owns the course
    if (courseId && eventCourseId) {
      const courseCheck = await connection`
        SELECT id, teacher_id FROM courses 
        WHERE id = ${courseId} AND teacher_id = ${teacherId} 
        LIMIT 1
      `;

      if (!courseCheck || courseCheck.length === 0) {
        return res.status(403).json({ 
          success: false, 
          message: "You don't have permission to edit events for this course" 
        });
      }
    }

    // Validate required fields
    if (!title || !start || !end) {
      return res.status(400).json({
        success: false,
        message: "title, start, and end are required"
      });
    }

    // Convert date strings to ISO strings for postgres-js
    const startDateStr = start instanceof Date ? start.toISOString() : start;
    const endDateStr = end instanceof Date ? end.toISOString() : end;

    // Validate dates
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format"
      });
    }

    console.log('Updating event:', {
      eventId,
      courseId,
      title,
      start: startDateStr,
      end: endDateStr,
      allDay,
      location,
      meetingLink,
      color
    });

    // Update event - directly set values since frontend sends all fields
    // Use ISO string format for dates (postgres-js expects strings, not Date objects)
    // Update by eventId and teacher ownership (works for both course events and standalone events)
    const updatedEvent = await connection`
      UPDATE course_events
      SET 
        title = ${title},
        description = ${description || null},
        start = ${startDateStr}::timestamp,
        "end" = ${endDateStr}::timestamp,
        all_day = ${allDay || false},
        location = ${location || null},
        meeting_link = ${meetingLink || null},
        color = ${color || 'sky'},
        updated_at = NOW()
      WHERE id = ${eventId} AND created_by = ${teacherId}
      RETURNING *
    `;

    console.log('Event updated in database:', updatedEvent[0]);

    if (!updatedEvent || updatedEvent.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found after update"
      });
    }

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
    console.error("updateTeacherCourseEvent error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to update event" 
    });
  }
};

// DELETE /api/v1/teacher/courses/:courseId/events/:eventId - Delete an event (teacher only)
export const deleteTeacherCourseEvent = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { courseId, eventId } = req.params;
    
    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Verify teacher owns the event
    const eventCheck = await connection`
      SELECT id, course_id, created_by FROM course_events 
      WHERE id = ${eventId} AND created_by = ${teacherId} 
      LIMIT 1
    `;

    if (!eventCheck || eventCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you don't have permission"
      });
    }

    // If courseId is provided, verify teacher owns the course
    if (courseId) {
      const courseCheck = await connection`
        SELECT id, teacher_id FROM courses 
        WHERE id = ${courseId} AND teacher_id = ${teacherId} 
        LIMIT 1
      `;

      if (!courseCheck || courseCheck.length === 0) {
        return res.status(403).json({ 
          success: false, 
          message: "You don't have permission to delete events for this course" 
        });
      }

      // Delete event with course check
      await connection`
        DELETE FROM course_events
        WHERE id = ${eventId} AND course_id = ${courseId} AND created_by = ${teacherId}
      `;
    } else {
      // Delete event without course check (standalone event)
      await connection`
        DELETE FROM course_events
        WHERE id = ${eventId} AND created_by = ${teacherId}
      `;
    }

    return res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("deleteTeacherCourseEvent error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to delete event" 
    });
  }
};
