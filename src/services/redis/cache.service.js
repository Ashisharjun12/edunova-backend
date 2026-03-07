import { RedisCacheConnection } from "../../config/redis.js";
import logger from "../../utils/logger.js";

// Performance metrics tracking
const cacheMetrics = {
  hits: {},
  misses: {},
  sets: {},
  get totalHits() {
    return Object.values(this.hits).reduce((sum, count) => sum + count, 0);
  },
  get totalMisses() {
    return Object.values(this.misses).reduce((sum, count) => sum + count, 0);
  },
  get hitRate() {
    const total = this.totalHits + this.totalMisses;
    return total > 0 ? (this.totalHits / total * 100).toFixed(2) : 0;
  }
};

// Log cache metrics periodically
setInterval(() => {
  if (cacheMetrics.totalHits + cacheMetrics.totalMisses > 0) {
    logger.info(`📊 Cache Metrics - Hits: ${cacheMetrics.totalHits}, Misses: ${cacheMetrics.totalMisses}, Hit Rate: ${cacheMetrics.hitRate}%`);
  }
}, 60000); // Log every minute

const CACHE_TTL = {
  CONVERSATIONS: 300, // 5 minutes
  USER_CONVERSATIONS: 300, // 5 minutes
  COURSE_DETAILS: 600, // 10 minutes
  COURSE_ASSIGNMENTS: 300, // 5 minutes
  COURSE_ANNOUNCEMENTS: 300, // 5 minutes
  COURSE_MEMBERS: 300, // 5 minutes
  COURSE_EVENTS: 300, // 5 minutes
  TEACHER_COURSES: 300, // 5 minutes
  TEACHER_STATS: 120, // 2 minutes
  TEACHER_EVENTS: 180, // 3 minutes
  TEACHER_COURSE_EVENTS: 180, // 3 minutes
  TEACHER_COURSE_MEETINGS: 180, // 3 minutes
  TEACHER_COURSE_ASSIGNMENTS: 300, // 5 minutes
  TEACHER_COURSE_ANNOUNCEMENTS: 300, // 5 minutes
  ENROLLED_STUDENTS: 180, // 3 minutes
  USER_NOTIFICATIONS: 300, // 5 minutes
  USER_UNREAD_COUNT: 60, // 1 minute
};

/**
 * Cache conversations list for a user
 */
export const cacheUserConversations = async (userId, conversations) => {
  try {
    const key = `conversations:${userId}`;
    await RedisCacheConnection.setex(key, CACHE_TTL.USER_CONVERSATIONS, JSON.stringify(conversations));
    logger.debug(`Cached conversations for user ${userId}`);
  } catch (error) {
    logger.error("Error caching user conversations:", error);
  }
};

/**
 * Get cached conversations for a user
 */
export const getCachedUserConversations = async (userId) => {
  try {
    const key = `conversations:${userId}`;
    const cached = await RedisCacheConnection.get(key);
    if (cached) {
      logger.debug(`Cache hit for conversations:${userId}`);
      return JSON.parse(cached);
    }
    logger.debug(`Cache miss for conversations:${userId}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached conversations:", error);
    return null;
  }
};

/**
 * Invalidate conversations cache for a user
 */
export const invalidateUserConversationsCache = async (userId) => {
  try {
    const key = `conversations:${userId}`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated conversations cache for user ${userId}`);
  } catch (error) {
    logger.error("Error invalidating conversations cache:", error);
  }
};

/**
 * Invalidate conversations cache for multiple users
 */
export const invalidateConversationsCacheForUsers = async (userIds) => {
  try {
    const pipeline = RedisCacheConnection.pipeline();
    userIds.forEach(userId => {
      pipeline.del(`conversations:${userId}`);
    });
    await pipeline.exec();
    logger.debug(`Invalidated conversations cache for ${userIds.length} users`);
  } catch (error) {
    logger.error("Error invalidating conversations cache for users:", error);
  }
};

/**
 * Cache course details
 */
export const cacheCourseDetails = async (courseId, courseData) => {
  try {
    const key = `course:${courseId}`;
    await RedisCacheConnection.setex(key, CACHE_TTL.COURSE_DETAILS, JSON.stringify(courseData));
    logger.debug(`Cached course details for ${courseId}`);
  } catch (error) {
    logger.error("Error caching course details:", error);
  }
};

/**
 * Get cached course details
 */
export const getCachedCourseDetails = async (courseId) => {
  try {
    const key = `course:${courseId}`;
    const cached = await RedisCacheConnection.get(key);
    if (cached) {
      logger.debug(`Cache hit for course:${courseId}`);
      return JSON.parse(cached);
    }
    logger.debug(`Cache miss for course:${courseId}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached course details:", error);
    return null;
  }
};

/**
 * Invalidate course cache
 */
export const invalidateCourseCache = async (courseId) => {
  try {
    const key = `course:${courseId}`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated course cache for ${courseId}`);
  } catch (error) {
    logger.error("Error invalidating course cache:", error);
  }
};

/**
 * Cache course assignments
 */
export const cacheCourseAssignments = async (courseId, assignments) => {
  try {
    const key = `course:${courseId}:assignments`;
    await RedisCacheConnection.setex(key, CACHE_TTL.COURSE_ASSIGNMENTS, JSON.stringify(assignments));
    logger.debug(`Cached course assignments for ${courseId}`);
  } catch (error) {
    logger.error("Error caching course assignments:", error);
  }
};

/**
 * Get cached course assignments
 */
export const getCachedCourseAssignments = async (courseId) => {
  try {
    const key = `course:${courseId}:assignments`;
    const cached = await RedisCacheConnection.get(key);
    if (cached) {
      logger.debug(`Cache hit for course assignments:${courseId}`);
      return JSON.parse(cached);
    }
    logger.debug(`Cache miss for course assignments:${courseId}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached course assignments:", error);
    return null;
  }
};

/**
 * Invalidate course assignments cache
 */
export const invalidateCourseAssignmentsCache = async (courseId) => {
  try {
    const key = `course:${courseId}:assignments`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated course assignments cache for ${courseId}`);
  } catch (error) {
    logger.error("Error invalidating course assignments cache:", error);
  }
};

/**
 * Cache course announcements
 */
export const cacheCourseAnnouncements = async (courseId, announcements) => {
  try {
    const key = `course:${courseId}:announcements`;
    await RedisCacheConnection.setex(key, CACHE_TTL.COURSE_ANNOUNCEMENTS, JSON.stringify(announcements));
    logger.debug(`Cached course announcements for ${courseId}`);
  } catch (error) {
    logger.error("Error caching course announcements:", error);
  }
};

/**
 * Get cached course announcements
 */
export const getCachedCourseAnnouncements = async (courseId) => {
  try {
    const key = `course:${courseId}:announcements`;
    const cached = await RedisCacheConnection.get(key);
    if (cached) {
      logger.debug(`Cache hit for course announcements:${courseId}`);
      return JSON.parse(cached);
    }
    logger.debug(`Cache miss for course announcements:${courseId}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached course announcements:", error);
    return null;
  }
};

/**
 * Invalidate course announcements cache
 */
export const invalidateCourseAnnouncementsCache = async (courseId) => {
  try {
    const key = `course:${courseId}:announcements`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated course announcements cache for ${courseId}`);
  } catch (error) {
    logger.error("Error invalidating course announcements cache:", error);
  }
};

/**
 * Cache course members
 */
export const cacheCourseMembers = async (courseId, members) => {
  try {
    const key = `course:${courseId}:members`;
    await RedisCacheConnection.setex(key, CACHE_TTL.COURSE_MEMBERS, JSON.stringify(members));
    logger.debug(`Cached course members for ${courseId}`);
  } catch (error) {
    logger.error("Error caching course members:", error);
  }
};

/**
 * Get cached course members
 */
export const getCachedCourseMembers = async (courseId) => {
  try {
    const key = `course:${courseId}:members`;
    const cached = await RedisCacheConnection.get(key);
    if (cached) {
      logger.debug(`Cache hit for course members:${courseId}`);
      return JSON.parse(cached);
    }
    logger.debug(`Cache miss for course members:${courseId}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached course members:", error);
    return null;
  }
};

/**
 * Invalidate course members cache
 */
export const invalidateCourseMembersCache = async (courseId) => {
  try {
    const key = `course:${courseId}:members`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated course members cache for ${courseId}`);
  } catch (error) {
    logger.error("Error invalidating course members cache:", error);
  }
};

/**
 * Cache course events
 */
export const cacheCourseEvents = async (courseId, events) => {
  try {
    const key = `course:${courseId}:events`;
    await RedisCacheConnection.setex(key, CACHE_TTL.COURSE_EVENTS, JSON.stringify(events));
    logger.debug(`Cached course events for ${courseId}`);
  } catch (error) {
    logger.error("Error caching course events:", error);
  }
};

/**
 * Get cached course events
 */
export const getCachedCourseEvents = async (courseId) => {
  try {
    const key = `course:${courseId}:events`;
    const cached = await RedisCacheConnection.get(key);
    if (cached) {
      logger.debug(`Cache hit for course events:${courseId}`);
      return JSON.parse(cached);
    }
    logger.debug(`Cache miss for course events:${courseId}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached course events:", error);
    return null;
  }
};

/**
 * Invalidate course events cache
 */
export const invalidateCourseEventsCache = async (courseId) => {
  try {
    const key = `course:${courseId}:events`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated course events cache for ${courseId}`);
  } catch (error) {
    logger.error("Error invalidating course events cache:", error);
  }
};

/**
 * Cache teacher courses list
 */
export const cacheTeacherCourses = async (teacherId, courses) => {
  try {
    const key = `teacher:${teacherId}:courses`;
    const startTime = Date.now();
    await RedisCacheConnection.setex(key, CACHE_TTL.TEACHER_COURSES, JSON.stringify(courses));
    const duration = Date.now() - startTime;
    cacheMetrics.sets['teacher_courses'] = (cacheMetrics.sets['teacher_courses'] || 0) + 1;
    logger.debug(`Cached teacher courses for ${teacherId} (${duration}ms)`);
  } catch (error) {
    logger.error("Error caching teacher courses:", error);
  }
};

/**
 * Get cached teacher courses
 */
export const getCachedTeacherCourses = async (teacherId) => {
  try {
    const key = `teacher:${teacherId}:courses`;
    const cached = await RedisCacheConnection.get(key);
    if (cached) {
      logger.debug(`Cache hit for teacher courses:${teacherId}`);
      return JSON.parse(cached);
    }
    logger.debug(`Cache miss for teacher courses:${teacherId}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached teacher courses:", error);
    return null;
  }
};

/**
 * Invalidate teacher courses cache
 */
export const invalidateTeacherCoursesCache = async (teacherId) => {
  try {
    const key = `teacher:${teacherId}:courses`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated teacher courses cache for ${teacherId}`);
  } catch (error) {
    logger.error("Error invalidating teacher courses cache:", error);
  }
};

/**
 * Cache teacher dashboard stats
 */
export const cacheTeacherStats = async (teacherId, stats) => {
  try {
    const key = `teacher:${teacherId}:stats`;
    const startTime = Date.now();
    await RedisCacheConnection.setex(key, CACHE_TTL.TEACHER_STATS, JSON.stringify(stats));
    const duration = Date.now() - startTime;
    cacheMetrics.sets['teacher_stats'] = (cacheMetrics.sets['teacher_stats'] || 0) + 1;
    logger.debug(`Cached teacher stats for ${teacherId} (${duration}ms)`);
  } catch (error) {
    logger.error("Error caching teacher stats:", error);
  }
};

/**
 * Get cached teacher stats
 */
export const getCachedTeacherStats = async (teacherId) => {
  try {
    const key = `teacher:${teacherId}:stats`;
    const startTime = Date.now();
    const cached = await RedisCacheConnection.get(key);
    const duration = Date.now() - startTime;
    
    if (cached) {
      cacheMetrics.hits['teacher_stats'] = (cacheMetrics.hits['teacher_stats'] || 0) + 1;
      logger.debug(`Cache hit for teacher stats:${teacherId} (${duration}ms)`);
      return JSON.parse(cached);
    }
    cacheMetrics.misses['teacher_stats'] = (cacheMetrics.misses['teacher_stats'] || 0) + 1;
    logger.debug(`Cache miss for teacher stats:${teacherId} (${duration}ms)`);
    return null;
  } catch (error) {
    logger.error("Error getting cached teacher stats:", error);
    return null;
  }
};

/**
 * Invalidate teacher stats cache
 */
export const invalidateTeacherStatsCache = async (teacherId) => {
  try {
    const key = `teacher:${teacherId}:stats`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated teacher stats cache for ${teacherId}`);
  } catch (error) {
    logger.error("Error invalidating teacher stats cache:", error);
  }
};

/**
 * Cache teacher events (all events for a teacher)
 */
export const cacheTeacherEvents = async (teacherId, events) => {
  try {
    // Only cache if events array has data
    if (!events || !Array.isArray(events) || events.length === 0) {
      logger.debug(`Skipping cache for empty events array: teacher ${teacherId}`);
      return;
    }
    const key = `teacher:${teacherId}:events`;
    await RedisCacheConnection.setex(key, CACHE_TTL.TEACHER_EVENTS, JSON.stringify(events));
    logger.debug(`Cached teacher events for ${teacherId}`);
  } catch (error) {
    logger.error("Error caching teacher events:", error);
  }
};

/**
 * Get cached teacher events
 */
export const getCachedTeacherEvents = async (teacherId) => {
  try {
    const key = `teacher:${teacherId}:events`;
    const cached = await RedisCacheConnection.get(key);
    if (cached) {
      logger.debug(`Cache hit for teacher events:${teacherId}`);
      return JSON.parse(cached);
    }
    logger.debug(`Cache miss for teacher events:${teacherId}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached teacher events:", error);
    return null;
  }
};

/**
 * Invalidate teacher events cache
 */
export const invalidateTeacherEventsCache = async (teacherId) => {
  try {
    const key = `teacher:${teacherId}:events`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated teacher events cache for ${teacherId}`);
  } catch (error) {
    logger.error("Error invalidating teacher events cache:", error);
  }
};

/**
 * Cache teacher course events
 */
export const cacheTeacherCourseEvents = async (courseId, events) => {
  try {
    // Only cache if events array has data
    if (!events || !Array.isArray(events) || events.length === 0) {
      logger.debug(`Skipping cache for empty events array: ${courseId}`);
      return;
    }
    const key = `teacher:course:${courseId}:events`;
    await RedisCacheConnection.setex(key, CACHE_TTL.TEACHER_COURSE_EVENTS, JSON.stringify(events));
    logger.debug(`Cached teacher course events for ${courseId}`);
  } catch (error) {
    logger.error("Error caching teacher course events:", error);
  }
};

/**
 * Get cached teacher course events
 */
export const getCachedTeacherCourseEvents = async (courseId) => {
  try {
    const key = `teacher:course:${courseId}:events`;
    const cached = await RedisCacheConnection.get(key);
    if (cached) {
      logger.debug(`Cache hit for teacher course events:${courseId}`);
      return JSON.parse(cached);
    }
    logger.debug(`Cache miss for teacher course events:${courseId}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached teacher course events:", error);
    return null;
  }
};

/**
 * Invalidate teacher course events cache
 */
export const invalidateTeacherCourseEventsCache = async (courseId) => {
  try {
    const key = `teacher:course:${courseId}:events`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated teacher course events cache for ${courseId}`);
  } catch (error) {
    logger.error("Error invalidating teacher course events cache:", error);
  }
};

/**
 * Cache teacher course meetings
 */
export const cacheTeacherCourseMeetings = async (courseId, meetings) => {
  try {
    // Only cache if meetings array has data
    if (!meetings || !Array.isArray(meetings) || meetings.length === 0) {
      logger.debug(`Skipping cache for empty meetings array: ${courseId}`);
      return;
    }
    const key = `teacher:course:${courseId}:meetings`;
    await RedisCacheConnection.setex(key, CACHE_TTL.TEACHER_COURSE_MEETINGS, JSON.stringify(meetings));
    logger.debug(`Cached teacher course meetings for ${courseId}`);
  } catch (error) {
    logger.error("Error caching teacher course meetings:", error);
  }
};

/**
 * Get cached teacher course meetings
 */
export const getCachedTeacherCourseMeetings = async (courseId) => {
  try {
    const key = `teacher:course:${courseId}:meetings`;
    const cached = await RedisCacheConnection.get(key);
    if (cached) {
      logger.debug(`Cache hit for teacher course meetings:${courseId}`);
      return JSON.parse(cached);
    }
    logger.debug(`Cache miss for teacher course meetings:${courseId}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached teacher course meetings:", error);
    return null;
  }
};

/**
 * Invalidate teacher course meetings cache
 */
export const invalidateTeacherCourseMeetingsCache = async (courseId) => {
  try {
    const key = `teacher:course:${courseId}:meetings`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated teacher course meetings cache for ${courseId}`);
  } catch (error) {
    logger.error("Error invalidating teacher course meetings cache:", error);
  }
};

/**
 * Cache teacher course assignments
 */
export const cacheTeacherCourseAssignments = async (courseId, assignments) => {
  try {
    const key = `teacher:course:${courseId}:assignments`;
    await RedisCacheConnection.setex(key, CACHE_TTL.TEACHER_COURSE_ASSIGNMENTS, JSON.stringify(assignments));
    logger.debug(`Cached teacher course assignments for ${courseId}`);
  } catch (error) {
    logger.error("Error caching teacher course assignments:", error);
  }
};

/**
 * Get cached teacher course assignments
 */
export const getCachedTeacherCourseAssignments = async (courseId) => {
  try {
    const key = `teacher:course:${courseId}:assignments`;
    const cached = await RedisCacheConnection.get(key);
    if (cached) {
      logger.debug(`Cache hit for teacher course assignments:${courseId}`);
      return JSON.parse(cached);
    }
    logger.debug(`Cache miss for teacher course assignments:${courseId}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached teacher course assignments:", error);
    return null;
  }
};

/**
 * Invalidate teacher course assignments cache
 */
export const invalidateTeacherCourseAssignmentsCache = async (courseId) => {
  try {
    const key = `teacher:course:${courseId}:assignments`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated teacher course assignments cache for ${courseId}`);
  } catch (error) {
    logger.error("Error invalidating teacher course assignments cache:", error);
  }
};

/**
 * Cache teacher course announcements
 */
export const cacheTeacherCourseAnnouncements = async (courseId, announcements) => {
  try {
    const key = `teacher:course:${courseId}:announcements`;
    await RedisCacheConnection.setex(key, CACHE_TTL.TEACHER_COURSE_ANNOUNCEMENTS, JSON.stringify(announcements));
    logger.debug(`Cached teacher course announcements for ${courseId}`);
  } catch (error) {
    logger.error("Error caching teacher course announcements:", error);
  }
};

/**
 * Get cached teacher course announcements
 */
export const getCachedTeacherCourseAnnouncements = async (courseId) => {
  try {
    const key = `teacher:course:${courseId}:announcements`;
    const cached = await RedisCacheConnection.get(key);
    if (cached) {
      logger.debug(`Cache hit for teacher course announcements:${courseId}`);
      return JSON.parse(cached);
    }
    logger.debug(`Cache miss for teacher course announcements:${courseId}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached teacher course announcements:", error);
    return null;
  }
};

/**
 * Invalidate teacher course announcements cache
 */
export const invalidateTeacherCourseAnnouncementsCache = async (courseId) => {
  try {
    const key = `teacher:course:${courseId}:announcements`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated teacher course announcements cache for ${courseId}`);
  } catch (error) {
    logger.error("Error invalidating teacher course announcements cache:", error);
  }
};

/**
 * Cache enrolled students for a teacher
 */
export const cacheEnrolledStudents = async (teacherId, students) => {
  try {
    const key = `teacher:${teacherId}:students`;
    await RedisCacheConnection.setex(key, CACHE_TTL.ENROLLED_STUDENTS, JSON.stringify(students));
    logger.debug(`Cached enrolled students for teacher ${teacherId}`);
  } catch (error) {
    logger.error("Error caching enrolled students:", error);
  }
};

/**
 * Get cached enrolled students
 */
export const getCachedEnrolledStudents = async (teacherId) => {
  try {
    const key = `teacher:${teacherId}:students`;
    const cached = await RedisCacheConnection.get(key);
    if (cached) {
      logger.debug(`Cache hit for enrolled students:${teacherId}`);
      return JSON.parse(cached);
    }
    logger.debug(`Cache miss for enrolled students:${teacherId}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached enrolled students:", error);
    return null;
  }
};

/**
 * Invalidate enrolled students cache
 */
export const invalidateEnrolledStudentsCache = async (teacherId) => {
  try {
    const key = `teacher:${teacherId}:students`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated enrolled students cache for teacher ${teacherId}`);
  } catch (error) {
    logger.error("Error invalidating enrolled students cache:", error);
  }
};

/**
 * Cache user notifications
 */
export const cacheUserNotifications = async (userId, page, notifications, pagination) => {
  try {
    const key = `notifications:${userId}:page:${page}`;
    const data = { notifications, pagination };
    await RedisCacheConnection.setex(key, CACHE_TTL.USER_NOTIFICATIONS, JSON.stringify(data));
    logger.debug(`Cached notifications for user ${userId} page ${page}`);
  } catch (error) {
    logger.error("Error caching user notifications:", error);
  }
};

/**
 * Get cached user notifications
 */
export const getCachedUserNotifications = async (userId, page) => {
  try {
    const key = `notifications:${userId}:page:${page}`;
    const cached = await RedisCacheConnection.get(key);
    if (cached) {
      cacheMetrics.hits['user_notifications'] = (cacheMetrics.hits['user_notifications'] || 0) + 1;
      logger.debug(`Cache hit for notifications:${userId}:page:${page}`);
      return JSON.parse(cached);
    }
    cacheMetrics.misses['user_notifications'] = (cacheMetrics.misses['user_notifications'] || 0) + 1;
    logger.debug(`Cache miss for notifications:${userId}:page:${page}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached user notifications:", error);
    return null;
  }
};

/**
 * Invalidate user notifications cache
 */
export const invalidateUserNotificationsCache = async (userId) => {
  try {
    // Delete all pages for this user
    const pattern = `notifications:${userId}:*`;
    const keys = await RedisCacheConnection.keys(pattern);
    if (keys.length > 0) {
      await RedisCacheConnection.del(...keys);
      logger.debug(`Invalidated ${keys.length} notification cache keys for user ${userId}`);
    }
    // Also invalidate unread count
    await invalidateUserUnreadCountCache(userId);
  } catch (error) {
    logger.error("Error invalidating user notifications cache:", error);
  }
};

/**
 * Cache user unread notification count
 */
export const cacheUserUnreadCount = async (userId, count) => {
  try {
    const key = `notifications:${userId}:unread_count`;
    await RedisCacheConnection.setex(key, CACHE_TTL.USER_UNREAD_COUNT, count.toString());
    logger.debug(`Cached unread count for user ${userId}: ${count}`);
  } catch (error) {
    logger.error("Error caching user unread count:", error);
  }
};

/**
 * Get cached user unread notification count
 */
export const getCachedUserUnreadCount = async (userId) => {
  try {
    const key = `notifications:${userId}:unread_count`;
    const cached = await RedisCacheConnection.get(key);
    if (cached !== null) {
      cacheMetrics.hits['unread_count'] = (cacheMetrics.hits['unread_count'] || 0) + 1;
      logger.debug(`Cache hit for unread count:${userId}`);
      return parseInt(cached, 10);
    }
    cacheMetrics.misses['unread_count'] = (cacheMetrics.misses['unread_count'] || 0) + 1;
    logger.debug(`Cache miss for unread count:${userId}`);
    return null;
  } catch (error) {
    logger.error("Error getting cached user unread count:", error);
    return null;
  }
};

/**
 * Invalidate user unread count cache
 */
export const invalidateUserUnreadCountCache = async (userId) => {
  try {
    const key = `notifications:${userId}:unread_count`;
    await RedisCacheConnection.del(key);
    logger.debug(`Invalidated unread count cache for user ${userId}`);
  } catch (error) {
    logger.error("Error invalidating user unread count cache:", error);
  }
};

/**
 * Invalidate all notification caches (for bulk deletions)
 */
export const invalidateAllNotificationCaches = async () => {
  try {
    const pattern = `notifications:*`;
    const keys = await RedisCacheConnection.keys(pattern);
    if (keys.length > 0) {
      await RedisCacheConnection.del(...keys);
      logger.info(`Invalidated ${keys.length} notification cache keys`);
    }
  } catch (error) {
    logger.error("Error invalidating all notification caches:", error);
  }
};

