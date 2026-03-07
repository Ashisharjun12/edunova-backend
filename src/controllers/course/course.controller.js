import { db } from '../../config/database.js'
import { courses, enrollments, users, images, sections, lessons, courseMaterials } from '../../models/index.js'
import { eq, desc, count, sql, and, asc, ne, or as drizzleOr } from 'drizzle-orm'
import { getCachedCourseDetails, cacheCourseDetails } from '../../services/redis/cache.service.js'
import logger from '../../utils/logger.js'

// Get all courses with details for public access
export const getAllCourses = async (req, res) => {
  try {
    console.log('Getting all courses with details...')

    // First, let's check what courses exist regardless of status
    const allCoursesCheck = await db
      .select({
        id: courses.id,
        title: courses.title,
        status: courses.status,
        difficulty: courses.difficulty
      })
      .from(courses)
      .limit(5)

    console.log('All courses in database (first 5):', allCoursesCheck)

    const allCourses = await db
      .select({
        id: courses.id,
        title: courses.title,
        description: courses.description,
        shortDescription: courses.shortDescription,
        thumbnailId: courses.thumbnailId,
        thumbnailUrl: images.url,
        instructorId: courses.teacherId,
        difficulty: courses.difficulty,
        status: courses.status,
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
        // Instructor details
        instructorName: users.name,
        instructorEmail: users.email,
        instructorAvatar: users.avatar,
        // Course stats from courses table
        studentCount: courses.studentCount,
        rating: courses.rating,
        ratingCount: courses.ratingCount,
        // Course content
        duration: courses.duration,
        tags: courses.tags,
        price: courses.price
      })
      .from(courses)
      .leftJoin(users, eq(courses.teacherId, users.id))
      .leftJoin(images, eq(courses.thumbnailId, images.id))
      .where(eq(courses.status, 'published'))
      .orderBy(desc(courses.createdAt))

    console.log('Courses found:', allCourses.length)

    // If no courses found, return mock data for testing
    if (allCourses.length === 0) {
      console.log('No courses found in database, returning mock data for testing')
      const mockCourses = [
        {
          id: 'mock-1',
          title: 'GATE Computer Science Complete Course',
          description: 'Comprehensive preparation for GATE CS with video lectures, practice tests, and doubt clearing sessions.',
          shortDescription: 'Comprehensive preparation for GATE CS with video lectures, practice tests, and doubt clearing sessions.',
          thumbnailUrl: '/api/placeholder/300/200',
          instructor: 'Dr. Rajesh Kumar',
          instructorEmail: 'rajesh@example.com',
          instructorAvatar: null,
          studentCount: 2500,
          rating: 4.8,
          ratingCount: 120,
          duration: '6 months',
          difficulty: 'advanced',
          status: 'published',
          lecturesCount: 45,
          tags: ['GATE', 'Computer Science', 'Preparation', 'Exams'],
          price: '₹12,999',
          originalPrice: null,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'mock-2',
          title: 'Technical Interview Mastery',
          description: 'Master coding interviews with comprehensive problem-solving techniques and mock interviews.',
          shortDescription: 'Master coding interviews with comprehensive problem-solving techniques and mock interviews.',
          thumbnailUrl: '/api/placeholder/300/200',
          instructor: 'Sarah Johnson',
          instructorEmail: 'sarah@example.com',
          instructorAvatar: null,
          studentCount: 1800,
          rating: 4.9,
          ratingCount: 95,
          duration: '3 months',
          difficulty: 'intermediate',
          status: 'published',
          lecturesCount: 32,
          tags: ['Interview', 'Coding', 'Problem Solving', 'Mock Interviews'],
          price: '₹8,999',
          originalPrice: null,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'mock-3',
          title: 'Data Structures & Algorithms',
          description: 'Build strong foundation in DSA with hands-on coding practice and real-world applications.',
          shortDescription: 'Build strong foundation in DSA with hands-on coding practice and real-world applications.',
          thumbnailUrl: '/api/placeholder/300/200',
          instructor: 'Prof. Michael Chen',
          instructorEmail: 'michael@example.com',
          instructorAvatar: null,
          studentCount: 3200,
          rating: 4.7,
          ratingCount: 180,
          duration: '4 months',
          difficulty: 'beginner',
          status: 'published',
          lecturesCount: 38,
          tags: ['DSA', 'Algorithms', 'Data Structures', 'Programming'],
          price: '₹6,999',
          originalPrice: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]

      return res.status(200).json({
        success: true,
        message: 'Mock courses returned for testing (no courses in database)',
        data: mockCourses,
        count: mockCourses.length
      })
    }

    // Process the data to format it properly
    const processedCourses = allCourses.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description,
      shortDescription: course.shortDescription || course.description?.substring(0, 150) + '...',
      thumbnailUrl: course.thumbnailUrl || '/api/placeholder/300/200',
      instructor: course.instructorName || 'Unknown Instructor',
      instructorEmail: course.instructorEmail,
      instructorAvatar: course.instructorAvatar || null,
      studentCount: course.studentCount || 0,
      rating: course.rating ? parseFloat((course.rating / 10).toFixed(1)) : 0,
      ratingCount: course.ratingCount || 0,
      duration: course.duration ? `${Math.floor(course.duration / 3600)} hours` : 'Not specified',
      difficulty: course.difficulty || 'beginner',
      status: course.status,
      lecturesCount: 0, // Will be calculated separately if needed
      tags: course.tags || [],
      price: course.price ? `₹${(course.price / 100).toFixed(2)}` : 'Free',
      originalPrice: null,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt
    }))

    console.log('Processed courses:', processedCourses.length)
    console.log('Sample course data:', JSON.stringify(processedCourses[0], null, 2))

    res.status(200).json({
      success: true,
      message: 'Courses retrieved successfully',
      data: processedCourses,
      count: processedCourses.length
    })

  } catch (error) {
    console.error('Error getting all courses:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve courses',
      error: error.message
    })
  }
}

// Get course by ID with full details
export const getCourseById = async (req, res) => {
  try {
    const { courseId } = req.params
    logger.info(`Getting course by ID: ${courseId}`)

    // Check cache first
    const cachedCourse = await getCachedCourseDetails(courseId)
    if (cachedCourse) {
      logger.info(`Cache hit for course: ${courseId}`)
      return res.status(200).json({
        success: true,
        message: 'Course retrieved successfully (cached)',
        data: cachedCourse
      })
    }

    logger.debug(`Cache miss for course: ${courseId}, fetching from database`)

    // Optimized: Get course with instructor and thumbnail in single query using LEFT JOINs
    const courseWithDetails = await db
      .select({
        // Course fields
        id: courses.id,
        title: courses.title,
        description: courses.description,
        shortDescription: courses.shortDescription,
        teacherId: courses.teacherId,
        thumbnailId: courses.thumbnailId,
        status: courses.status,
        difficulty: courses.difficulty,
        price: courses.price,
        duration: courses.duration,
        studentCount: courses.studentCount,
        rating: courses.rating,
        ratingCount: courses.ratingCount,
        tags: courses.tags,
        requirements: courses.requirements,
        learningOutcomes: courses.learningOutcomes,
        subjectId: courses.subjectId,
        semesterId: courses.semesterId,
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
        // Instructor fields
        instructorName: users.name,
        instructorEmail: users.email,
        instructorAvatar: users.avatar,
        // Thumbnail field
        thumbnailUrl: images.url
      })
      .from(courses)
      .leftJoin(users, eq(courses.teacherId, users.id))
      .leftJoin(images, eq(courses.thumbnailId, images.id))
      .where(and(eq(courses.id, courseId), eq(courses.status, 'published')))
      .limit(1)

    if (!courseWithDetails.length) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      })
    }

    const courseData = courseWithDetails[0]
    logger.debug('Course data found:', courseData.id)

    // Optimized: Fetch sections, lessons, and materials in parallel
    let sectionsWithLessons = []
    try {
      // Fetch all sections, lessons, and materials in parallel
      const [courseSections, allLessons, allMaterials] = await Promise.all([
        db.select().from(sections).where(eq(sections.courseId, courseId)).orderBy(asc(sections.position)),
        db.select().from(lessons).where(eq(lessons.courseId, courseId)).orderBy(asc(lessons.position)),
        db.select().from(courseMaterials).where(eq(courseMaterials.courseId, courseId))
      ])

      logger.debug(`Course sections: ${courseSections.length}, Lessons: ${allLessons.length}, Materials: ${allMaterials.length}`)

      // Map lessons by sectionId and materials by lessonId
      const lessonsBySectionId = new Map()
      for (const lesson of allLessons) {
        const arr = lessonsBySectionId.get(lesson.sectionId) || []
        arr.push(lesson)
        lessonsBySectionId.set(lesson.sectionId, arr)
      }

      const materialsByLessonId = new Map()
      for (const material of allMaterials) {
        if (material.lessonId) {
          const arr = materialsByLessonId.get(material.lessonId) || []
          arr.push(material)
          materialsByLessonId.set(material.lessonId, arr)
        }
      }

      // Build sections with lessons
      sectionsWithLessons = courseSections.map(section => ({
        id: section.id,
        title: section.title,
        description: section.description,
        position: section.position || 0,
        lessons: (lessonsBySectionId.get(section.id) || []).map(lesson => ({
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          type: lesson.type,
          duration: lesson.duration || 0,
          youtubeDuration: lesson.youtubeDuration || null,
          position: lesson.position || 0,
          videoUrl: lesson.videoUrl,
          content: lesson.content,
          materials: materialsByLessonId.get(lesson.id) || []
        }))
      }))

      logger.debug(`Processed ${sectionsWithLessons.length} sections with lessons`)
    } catch (sectionError) {
      logger.error('Error fetching sections/lessons:', sectionError)
      sectionsWithLessons = []
    }

    // Build the response object safely
    const processedCourse = {
      id: courseData.id,
      title: courseData.title || 'Untitled Course',
      description: courseData.description || '',
      shortDescription: courseData.shortDescription || (courseData.description ? courseData.description.substring(0, 150) + '...' : ''),
      thumbnailUrl: courseData.thumbnailUrl || '/api/placeholder/300/200',
      instructor: courseData.instructorName || 'Unknown Instructor',
      instructorEmail: courseData.instructorEmail || '',
      instructorAvatar: courseData.instructorAvatar || null,
      studentCount: courseData.studentCount || 0,
      rating: courseData.rating ? parseFloat((courseData.rating / 10).toFixed(1)) : 0,
      ratingCount: courseData.ratingCount || 0,
      duration: courseData.duration ? `${Math.floor(courseData.duration / 3600)} hours` : 'Not specified',
      difficulty: courseData.difficulty || 'beginner',
      status: courseData.status || 'published',
      lecturesCount: sectionsWithLessons.reduce((total, section) => total + (section.lessons ? section.lessons.length : 0), 0),
      tags: courseData.tags || [],
      price: courseData.price ? `₹${(courseData.price / 100).toFixed(2)}` : 'Free',
      originalPrice: null,
      createdAt: courseData.createdAt || new Date(),
      updatedAt: courseData.updatedAt || new Date(),
      // Add sections and lessons
      sections: sectionsWithLessons,
      // Add additional fields expected by frontend
      instructorName: courseData.instructorName || 'Unknown Instructor',
      courseDurationSeconds: courseData.duration || 0,
      learningOutcomes: courseData.learningOutcomes || [],
      requirements: courseData.requirements || [],
      subjectName: courseData.subjectName || null,
      semesterName: courseData.semesterName || null,
      teacherId: courseData.teacherId
    }

    // Get related courses (same subject, semester, or similar tags)
    let relatedCourses = []
    try {
      const relatedConditions = []
      
      if (courseData.subjectId) {
        relatedConditions.push(eq(courses.subjectId, courseData.subjectId))
      }
      if (courseData.semesterId) {
        relatedConditions.push(eq(courses.semesterId, courseData.semesterId))
      }
      
      if (relatedConditions.length > 0) {
        const related = await db
          .select({
            id: courses.id,
            title: courses.title,
            shortDescription: courses.shortDescription,
            thumbnailId: courses.thumbnailId,
            thumbnailUrl: images.url,
            instructorId: courses.teacherId,
            instructorName: users.name,
            studentCount: courses.studentCount,
            rating: courses.rating,
            ratingCount: courses.ratingCount,
            difficulty: courses.difficulty,
            price: courses.price,
          })
          .from(courses)
          .leftJoin(images, eq(courses.thumbnailId, images.id))
          .leftJoin(users, eq(courses.teacherId, users.id))
          .where(
            and(
              eq(courses.status, 'published'),
              ne(courses.id, courseId), // Exclude current course
              drizzleOr(...relatedConditions)
            )
          )
          .limit(6)
        
        relatedCourses = related.map(c => ({
          id: c.id,
          title: c.title,
          shortDescription: c.shortDescription || '',
          thumbnailUrl: c.thumbnailUrl || '/api/placeholder/300/200',
          instructor: c.instructorName || 'Unknown Instructor',
          studentCount: c.studentCount || 0,
          rating: c.rating ? parseFloat((c.rating / 10).toFixed(1)) : 0,
          ratingCount: c.ratingCount || 0,
          difficulty: c.difficulty || 'beginner',
          price: c.price ? `₹${(c.price / 100).toFixed(2)}` : 'Free',
        }))
      }
    } catch (relatedError) {
      console.error('Error fetching related courses:', relatedError)
      relatedCourses = []
    }

    const responseData = {
      ...processedCourse,
      relatedCourses: relatedCourses
    }

    // Cache the course data before returning
    await cacheCourseDetails(courseId, responseData)
    logger.info(`Cached course details for ${courseId}`)

    logger.info('Course details processed successfully')
    res.status(200).json({
      success: true,
      message: 'Course retrieved successfully',
      data: responseData
    })

  } catch (error) {
    console.error('Error getting course by ID:', error)
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      courseId: req.params.courseId
    })
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve course',
      error: error.message
    })
  }
}

// Get courses by category
export const getCoursesByCategory = async (req, res) => {
  try {
    const { category } = req.params
    console.log('Getting courses by category:', category)

    // This would need a category field in the courses table
    // For now, we'll filter by tags or return all courses
    const allCourses = await getAllCourses(req, res)
    
  } catch (error) {
    console.error('Error getting courses by category:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve courses by category',
      error: error.message
    })
  }
}
