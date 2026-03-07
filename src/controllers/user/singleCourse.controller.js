import { connection } from "../../config/database.js";

// GET /api/v1/auth/courses/:courseId/stats
export const getCourseStats = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    
    if (!courseId) {
      return res.status(400).json({ success: false, message: "courseId is required" });
    }

    // Execute all queries in parallel for better performance
    const [
      courseResult,
      enrollmentResult,
      lessonsResult,
      sectionsResult,
      completedLessonsResult
    ] = await Promise.all([
      // Get course with instructor and thumbnail in one query
      connection`
        SELECT 
          c.*,
          u.id as instructor_id,
          u.name as instructor_name,
          u.email as instructor_email,
          u.avatar as instructor_avatar,
          img.url as thumbnail_url
        FROM courses c
        LEFT JOIN users u ON u.id = c.teacher_id
        LEFT JOIN images img ON img.id = c.thumbnail_id
        WHERE c.id = ${courseId}
        LIMIT 1
      `,
      // Get enrollment
      connection`
        SELECT * FROM enrollments 
        WHERE user_id = ${userId} AND course_id = ${courseId} 
        LIMIT 1
      `,
      // Get all lessons with completion status
      connection`
        SELECT 
          l.id,
          l.title,
          l.duration,
          l.position,
          l.section_id,
          CASE WHEN el.completed = true THEN true ELSE false END as completed,
          el.completed_at
        FROM lessons l
        LEFT JOIN enrollment_lessons el ON el.lesson_id = l.id 
          AND el.enrollment_id = (SELECT id FROM enrollments WHERE user_id = ${userId} AND course_id = ${courseId} LIMIT 1)
        WHERE l.course_id = ${courseId}
        ORDER BY l.position ASC
      `,
      // Get sections
      connection`
        SELECT id, title FROM sections WHERE course_id = ${courseId}
      `,
      // Get completed lessons count and recent completed
      connection`
        SELECT 
          lesson_id,
          completed_at,
          (SELECT COUNT(*) FROM enrollment_lessons 
           WHERE enrollment_id = (SELECT id FROM enrollments WHERE user_id = ${userId} AND course_id = ${courseId} LIMIT 1)
           AND completed = true) as completed_count
        FROM enrollment_lessons
        WHERE enrollment_id = (SELECT id FROM enrollments WHERE user_id = ${userId} AND course_id = ${courseId} LIMIT 1)
          AND completed = true
        ORDER BY completed_at DESC
        LIMIT 5
      `
    ]);

    const courseData = courseResult[0];
    if (!courseData) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    const enrollment = enrollmentResult[0];
    if (!enrollment) {
      return res.status(403).json({ 
        success: false, 
        message: "Not enrolled in this course",
        course: {
          id: courseData.id,
          title: courseData.title,
          description: courseData.description,
        }
      });
    }

    const allLessonsRaw = lessonsResult || [];
    const sectionsList = sectionsResult || [];
    const completedLessonsData = completedLessonsResult || [];

    // Create section map
    const sectionMap = new Map();
    sectionsList.forEach(section => {
      sectionMap.set(section.id, section.title);
    });

    // Create completed lessons map
    const completedMap = new Map();
    completedLessonsData.forEach(item => {
      if (item.lesson_id) {
        completedMap.set(item.lesson_id, { completed: true, completedAt: item.completed_at });
      }
    });

    // Merge lessons with section titles and completion status
    const allLessons = allLessonsRaw.map(lesson => ({
      id: lesson.id,
      title: lesson.title,
      duration: lesson.duration,
      order: lesson.position,
      sectionId: lesson.section_id,
      sectionTitle: lesson.section_id ? (sectionMap.get(lesson.section_id) || null) : null,
      completed: lesson.completed || completedMap.has(lesson.id),
      completedAt: completedMap.has(lesson.id) ? completedMap.get(lesson.id).completedAt : null,
    }));

    // Get counts
    const totalLessons = allLessons.length;
    const completedLessons = parseInt(completedLessonsData[0]?.completed_count || 0) || 
      allLessons.filter(l => l.completed).length;

    // Calculate progress
    const progressPercent = totalLessons > 0 
      ? Math.round((completedLessons / totalLessons) * 100) 
      : 0;

    // Calculate time spent
    let timeSpentMinutes = 0;
    completedLessonsData.forEach(item => {
      const lesson = allLessonsRaw.find(l => l.id === item.lesson_id);
      if (lesson && lesson.duration) {
        timeSpentMinutes += parseInt(lesson.duration) || 0;
      }
    });

    const timeSpentHours = Math.floor(timeSpentMinutes / 60);
    const timeSpentMinutesRemainder = timeSpentMinutes % 60;
    const timeSpent = timeSpentHours > 0 
      ? `${timeSpentHours}h ${timeSpentMinutesRemainder}m`
      : `${timeSpentMinutesRemainder}m`;

    // Calculate total duration
    const totalDurationMinutes = allLessonsRaw.reduce((sum, lesson) => {
      return sum + (parseInt(lesson.duration) || 0);
    }, 0);
    const totalDurationHours = Math.floor(totalDurationMinutes / 60);
    const totalDurationMinutesRemainder = totalDurationMinutes % 60;
    const totalDuration = totalDurationHours > 0
      ? `${totalDurationHours}h ${totalDurationMinutesRemainder}m`
      : `${totalDurationMinutesRemainder}m`;

    // Get recent completed lessons
    const recentCompletedLessons = [];
    for (const item of completedLessonsData.slice(0, 5)) {
      const lesson = allLessonsRaw.find(l => l.id === item.lesson_id);
      if (lesson) {
        recentCompletedLessons.push({
          id: lesson.id,
          title: lesson.title,
          duration: lesson.duration,
          completedAt: item.completed_at,
        });
      }
    }

    // Get next lesson
    const nextLessonRaw = allLessons.find(lesson => !lesson.completed) || null;
    const nextLesson = nextLessonRaw ? {
      id: nextLessonRaw.id,
      title: nextLessonRaw.title,
      duration: nextLessonRaw.duration,
    } : null;

    // Calculate last accessed
    const lastAccessed = enrollment.updated_at 
      ? new Date(enrollment.updated_at)
      : new Date(enrollment.created_at);
    const daysSinceAccess = Math.floor((new Date() - lastAccessed) / (1000 * 60 * 60 * 24));
    const lastAccessedText = daysSinceAccess === 0 
      ? 'Today' 
      : daysSinceAccess === 1 
        ? '1 day ago' 
        : `${daysSinceAccess} days ago`;

    // Prepare recent lessons
    const recentLessons = allLessons.slice(0, 4).map(lesson => ({
      id: lesson.id,
      title: lesson.title,
      completed: lesson.completed || false,
      duration: lesson.duration ? `${lesson.duration} min` : 'N/A',
    }));

    // Chart data from completed lessons
    const completedLessonsWithDates = allLessons.filter(l => l.completed && l.completedAt);
    const weeklyStats = {};
    completedLessonsWithDates.forEach((lesson) => {
      if (lesson.completedAt) {
        const date = new Date(lesson.completedAt);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        weeklyStats[weekKey] = (weeklyStats[weekKey] || 0) + 1;
      }
    });

    const sortedWeeks = Object.keys(weeklyStats).sort();
    const chartData = sortedWeeks.slice(-4).map((weekKey, index) => ({
      week: `Week ${index + 1}`,
      completed: weeklyStats[weekKey],
    }));

    const finalChartData = chartData.length > 0 ? chartData : [
      { week: 'Week 1', completed: 0 },
      { week: 'Week 2', completed: 0 },
      { week: 'Week 3', completed: 0 },
      { week: 'Week 4', completed: 0 },
    ];

    // Achievements based on dynamic progress
    const achievements = [
      {
        id: 1,
        title: 'First Steps',
        description: 'Completed first lesson',
        icon: '🎯',
        unlocked: completedLessons >= 1,
      },
      {
        id: 2,
        title: 'Week Warrior',
        description: 'Completed 7 lessons in a week',
        icon: '🔥',
        unlocked: completedLessons >= 7,
      },
      {
        id: 3,
        title: 'Halfway Hero',
        description: 'Completed 50% of the course',
        icon: '⭐',
        unlocked: progressPercent >= 50,
      },
      {
        id: 4,
        title: 'Course Master',
        description: 'Completed all lessons',
        icon: '🏆',
        unlocked: progressPercent === 100,
      },
    ];

    return res.status(200).json({
      success: true,
      data: {
        course: {
          id: courseData.id,
          title: courseData.title,
          description: courseData.description,
          shortDescription: courseData.short_description,
          thumbnailUrl: courseData.thumbnail_url,
          difficulty: courseData.difficulty,
          duration: totalDuration,
          rating: courseData.rating,
          ratingCount: courseData.rating_count,
          enrolledStudents: courseData.student_count,
          tags: courseData.tags,
          instructor: {
            id: courseData.instructor_id,
            name: courseData.instructor_name || 'Unknown',
            email: courseData.instructor_email || '',
            avatar: courseData.instructor_avatar || null,
          },
        },
        enrollment: {
          progress: progressPercent,
          completedLessons,
          totalLessons,
          timeSpent,
          totalDuration,
          lastAccessed: lastAccessedText,
          enrolledAt: enrollment.created_at,
        },
        nextLesson: nextLesson,
        recentLessons,
        achievements,
        chartData: finalChartData,
        stats: {
          averageScore: 0,
          assignmentsCompleted: 0,
          assignmentsTotal: 0,
          quizzesCompleted: 0,
          quizzesTotal: 0,
        },
      },
    });
  } catch (error) {
    console.error("getCourseStats error:", error);
    console.error("Error stack:", error.stack);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to fetch course stats" 
    });
  }
};

