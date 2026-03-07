import { db } from "../../config/database.js";
import { transaction } from "../../transcation/transcation.js";
import { courses, sections, lessons, courseMaterials, COURSE_STATUS } from "../../models/course.model.js";
import { images } from "../../models/document.model.js";
import { users } from "../../models/user.model.js";
import { enrollments, enrollmentLessons } from "../../models/enrollement.model.js";
import { uploadSingleImage, deleteImageFromImageKit } from "../../services/imagekit.js";
import { eq, sql, and, desc, inArray } from "drizzle-orm";
import { notifyCourseStudents } from "../../services/notification/notification.service.js";
import { subjects, semesters } from "../../models/branch.model.js";
import { 
  invalidateCourseCache
} from "../../services/redis/cache.service.js";
import logger from "../../utils/logger.js";


export const createCourse = async (req, res) => {
  const teacherId = req.user?.id || req.body.teacherId; // fallback for testing
  if (!teacherId) {
    return res.status(400).json({ success: false, message: "teacherId is required" });
  }

  const { course: courseInput, sections: sectionsInput = [] } = req.body || {};
  if (!courseInput?.title) {
    return res.status(400).json({ success: false, message: "course.title is required" });
  }

  console.log('🚀 Backend createCourse called with:', { courseInput, sectionsInput });
  console.log('🚀 Sections count:', sectionsInput.length);
  
  sectionsInput.forEach((section, sIdx) => {
    console.log(`🚀 Section ${sIdx + 1} (${section.title}):`, section.lessons?.length || 0, 'lessons');
    if (section.lessons) {
      section.lessons.forEach((lesson, lIdx) => {
        console.log(`  🚀 Lesson ${lIdx + 1} (${lesson.title}):`, lesson.materials?.length || 0, 'materials');
        if (lesson.materials && lesson.materials.length > 0) {
          lesson.materials.forEach((material, mIdx) => {
            console.log(`    🚀 Material ${mIdx + 1}:`, material.title, material.fileUrl);
          });
        }
      });
    }
  });

  try {
    const result = await transaction(async (tx) => {
      // 1) Optional thumbnail
      let thumbnailId = null;
      if (courseInput.thumbnailUrl) {
        const [img] = await tx
          .insert(images)
          .values({ imageType: 'course_thumbnail', imageStatus: 'done', url: courseInput.thumbnailUrl, fileId: courseInput.providerFileId || null, filePath: null, size: 0 })
          .returning();
        thumbnailId = img?.id || null;
      }

      // 2) Create course (draft by default)
      const [createdCourse] = await tx
        .insert(courses)
        .values({
          teacherId,
          title: courseInput.title,
          description: courseInput.description || null,
          shortDescription: courseInput.shortDescription || null,
          thumbnailId: thumbnailId || null,
          difficulty: courseInput.difficulty || 'beginner',
          price: courseInput.price || 0,
          tags: courseInput.tags || null,
          requirements: courseInput.requirements || null,
          learningOutcomes: courseInput.learningOutcomes || null,
          subjectId: courseInput.subjectId || null,
          semesterId: courseInput.semesterId || null,
          status: 'draft',
        })
        .returning();

      const createdSections = [];
      const createdLessons = [];
      const createdMaterials = [];

      // 2) Optionally create sections/lessons/materials
      for (const sectionInput of sectionsInput) {
        const [createdSection] = await tx
          .insert(sections)
          .values({
            courseId: createdCourse.id,
            title: sectionInput.title,
            description: sectionInput.description || null,
            position: sectionInput.position ?? 0,
          })
          .returning();
        createdSections.push(createdSection);

        const lessonsInput = sectionInput.lessons || [];
        for (const lessonInput of lessonsInput) {
          const [createdLesson] = await tx
            .insert(lessons)
            .values({
              courseId: createdCourse.id,
              sectionId: createdSection.id,
              title: lessonInput.title,
              description: (lessonInput.description && lessonInput.description.trim()) ? lessonInput.description : 'Lesson',
              position: lessonInput.position ?? 0,
              duration: typeof lessonInput.duration === 'number' && lessonInput.duration > 0 ? lessonInput.duration : 60,
              youtubeVideoId: lessonInput.youtubeVideoId || null,
              youtubeUrl: lessonInput.youtubeUrl || null,
              youtubeEmbedUrl: lessonInput.youtubeEmbedUrl || null,
              youtubeTitle: lessonInput.youtubeTitle || null,
              youtubeDescription: lessonInput.youtubeDescription || null,
              youtubeThumbnail: lessonInput.youtubeThumbnail || null,
              youtubeDuration: lessonInput.youtubeDuration || null,
              linkedEventId: lessonInput.linkedEventId || null, // Added linkedEventId
            })
            .returning();
          createdLessons.push(createdLesson);

          // Insert lesson materials if provided
          const materialsInput = Array.isArray(lessonInput.materials) ? lessonInput.materials : [];
          console.log(`🔧 Processing materials for lesson "${lessonInput.title}":`, materialsInput.length, 'materials');
          
          for (const m of materialsInput) {
            console.log(`🔧 Creating material:`, m.title, m.fileUrl);
            const [createdMaterial] = await tx
              .insert(courseMaterials)
              .values({
                courseId: createdCourse.id,
                lessonId: createdLesson.id,
                sectionId: createdSection.id,
                title: m.title || 'Material',
                description: m.description || null,
                materialType: 'external_url',
                fileUrl: m.fileUrl || null,
                providerFileId: m.providerFileId || null,
              })
              .returning();
            console.log(`🔧 Material created with ID:`, createdMaterial.id);
            createdMaterials.push(createdMaterial);
          }
        }
      }

      return { course: createdCourse, sections: createdSections, lessons: createdLessons, materials: createdMaterials };
    });


    return res.status(201).json({ success: true, message: "Course created", ...result });
  } catch (error) {
    console.error("createCourse error:", error);
    return res.status(500).json({ success: false, message: "Failed to create course" });
  }
};

export const addSection = async (req, res) => {
  const teacherId = req.user?.id || req.body.teacherId;
  const { courseId } = req.params;
  const { title, description, position = 0 } = req.body || {};

  if (!teacherId) return res.status(400).json({ success: false, message: "teacherId is required" });
  if (!courseId) return res.status(400).json({ success: false, message: "courseId is required" });
  if (!title) return res.status(400).json({ success: false, message: "title is required" });

  try {
    const [section] = await db
      .insert(sections)
      .values({ courseId, title, description: description || null, position })
      .returning();
    return res.status(201).json({ success: true, section });
  } catch (error) {
    console.error("addSection error:", error);
    return res.status(500).json({ success: false, message: "Failed to add section" });
  }
};

export const addLesson = async (req, res) => {
  const teacherId = req.user?.id || req.body.teacherId;
  let { courseId, sectionId } = req.params;
  const lessonInput = req.body || {};

  // Handle string "null" values and convert to actual null
  if (courseId === 'null' || courseId === null) {
    return res.status(400).json({ success: false, message: "courseId is required" });
  }
  if (sectionId === 'null' || sectionId === null) {
    return res.status(400).json({ success: false, message: "sectionId is required" });
  }

  if (!teacherId) return res.status(400).json({ success: false, message: "teacherId is required" });
  if (!courseId) return res.status(400).json({ success: false, message: "courseId is required" });
  if (!sectionId) return res.status(400).json({ success: false, message: "sectionId is required" });
  if (!lessonInput.title) return res.status(400).json({ success: false, message: "lesson.title is required" });

  try {
    const result = await transaction(async (tx) => {
      const [createdLesson] = await tx
        .insert(lessons)
        .values({
          courseId,
          sectionId,
          title: lessonInput.title,
          description: (lessonInput.description && lessonInput.description.trim()) ? lessonInput.description : 'Lesson',
          position: lessonInput.position ?? 0,
          duration: typeof lessonInput.duration === 'number' && lessonInput.duration > 0 ? lessonInput.duration : 60,
          youtubeVideoId: lessonInput.youtubeVideoId || null,
          youtubeUrl: lessonInput.youtubeUrl || null,
          youtubeEmbedUrl: lessonInput.youtubeEmbedUrl || null,
          youtubeTitle: lessonInput.youtubeTitle || null,
          youtubeDescription: lessonInput.youtubeDescription || null,
          youtubeThumbnail: lessonInput.youtubeThumbnail || null,
          youtubeDuration: lessonInput.youtubeDuration || null,
          linkedEventId: lessonInput.linkedEventId || null, // Added linkedEventId
        })
        .returning();

    // Skip materials creation; return lesson only
    return { lesson: createdLesson, materials: [] };
    });

    // Notify enrolled students about new lesson
    // NOTE: This creates a NOTIFICATION (not an announcement)
    // Notifications appear in the notification bell, NOT on the announcements page
    // Only manual announcements created via POST /teacher/announcements appear on announcements page
    try {
      await notifyCourseStudents(
        courseId,
        'lesson_added', // Notification type - appears in notification bell only
        `New Lesson: ${lessonInput.title}`,
        lessonInput.description || `A new lesson "${lessonInput.title}" has been added to the course.`,
        { lessonId: result.lesson.id }
      );
    } catch (notificationError) {
      console.error('Error sending lesson notifications:', notificationError);
      // Don't fail the request if notifications fail
    }

    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.error("addLesson error:", error);
    return res.status(500).json({ success: false, message: "Failed to add lesson" });
  }
};

// Material upload via multer (memory) -> ImageKit
export const uploadMaterial = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "file is required" });
    }
    const result = await uploadSingleImage(req.file, "/uploads/materials");
    return res.status(200).json({ success: true, url: result.url, fileId: result.fileId, fileName: result.fileName });
  } catch (error) {
    console.error("uploadMaterial error:", error);
    return res.status(500).json({ success: false, message: "Failed to upload material" });
  }
};

// Attach a material record to an existing lesson (store in DB)
export const attachMaterialToLesson = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { title, description = null, fileUrl, providerFileId = null } = req.body || {};

    if (!lessonId) return res.status(400).json({ success: false, message: "lessonId is required" });
    if (!title) return res.status(400).json({ success: false, message: "title is required" });
    if (!fileUrl) return res.status(400).json({ success: false, message: "fileUrl is required" });

    // find lesson to derive courseId and sectionId
    const [les] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
    if (!les) return res.status(404).json({ success: false, message: "Lesson not found" });

    const [material] = await db
      .insert(courseMaterials)
      .values({
        courseId: les.courseId,
        lessonId: les.id,
        sectionId: les.sectionId,
        title,
        description,
        materialType: 'external_url',
        fileUrl,
        providerFileId,
      })
      .returning();

    return res.status(201).json({ success: true, material });
  } catch (error) {
    console.error("attachMaterialToLesson error:", error);
    return res.status(500).json({ success: false, message: "Failed to attach material" });
  }
};

// Delete a material from a lesson
export const deleteMaterial = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) return res.status(401).json({ success: false, message: "Unauthorized" });
    
    const { materialId } = req.params;

    const [deleted] = await db
      .delete(courseMaterials)
      .where(eq(courseMaterials.id, materialId))
      .returning();

    if (!deleted) return res.status(404).json({ success: false, message: "Material not found" });
    return res.status(200).json({ success: true, message: "Material deleted" });
  } catch (error) {
    console.error("deleteMaterial error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete material" });
  }
};

// Get all courses for the authenticated teacher
export const getTeacherCourses = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // Join thumbnail image url (if available)
    const data = await db
      .select({
        id: courses.id,
        teacherId: courses.teacherId,
        subjectId: courses.subjectId,
        semesterId: courses.semesterId,
        branchId: courses.branchId,
        title: courses.title,
        description: courses.description,
        shortDescription: courses.shortDescription,
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
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
        publishedAt: courses.publishedAt,
        thumbnailUrl: images.url,
        lecturesCount: sql`(select count(*)::int from lessons where lessons.course_id = ${courses.id})`,
      })
      .from(courses)
      .leftJoin(images, eq(courses.thumbnailId, images.id))
      .where(eq(courses.teacherId, teacherId));

    // Convert rating from stored format (multiplied by 10) to display format
    const processedCourses = data.map(course => ({
      ...course,
      rating: course.rating ? parseFloat((course.rating / 10).toFixed(1)) : 0
    }));

    return res.status(200).json({ success: true, courses: processedCourses });
  } catch (error) {
    console.error("getTeacherCourses error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch courses" });
  }
};

// Public: get course by id with sections, lessons, materials, and thumbnail url
export const getCourseById = async (req, res) => {
  try {
    const { courseId } = req.params;
    // Base course with thumbnail url
    const [course] = await db
      .select({
        id: courses.id,
        teacherId: courses.teacherId,
        subjectId: courses.subjectId,
        semesterId: courses.semesterId,
        branchId: courses.branchId,
        title: courses.title,
        description: courses.description,
        shortDescription: courses.shortDescription,
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
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
        publishedAt: courses.publishedAt,
        thumbnailUrl: images.url,
        instructorName: users.name,
        subjectName: subjects.name,
        semesterName: semesters.name,
      })
      .from(courses)
      .leftJoin(images, eq(courses.thumbnailId, images.id))
      .leftJoin(users, eq(courses.teacherId, users.id))
      .leftJoin(subjects, eq(courses.subjectId, subjects.id))
      .leftJoin(semesters, eq(courses.semesterId, semesters.id))
      .where(eq(courses.id, courseId));

    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    // Sections
    const sectionRows = await db.select().from(sections).where(eq(sections.courseId, courseId));
    // Lessons per section
    const lessonRows = await db.select().from(lessons).where(eq(lessons.courseId, courseId));
    // Materials per course
    const materialRows = await db.select().from(courseMaterials).where(eq(courseMaterials.courseId, courseId));

    // Assemble structure
    const sectionIdToLessons = new Map();
    for (const l of lessonRows) {
      const arr = sectionIdToLessons.get(l.sectionId) || [];
      arr.push(l);
      sectionIdToLessons.set(l.sectionId, arr);
    }
    const lessonIdToMaterials = new Map();
    for (const m of materialRows) {
      const arr = lessonIdToMaterials.get(m.lessonId) || [];
      arr.push(m);
      lessonIdToMaterials.set(m.lessonId, arr);
    }
    let courseDurationSeconds = 0;
    const sectionsFull = sectionRows.map((s) => {
      const lessonsForSection = (sectionIdToLessons.get(s.id) || []).map((le) => ({
        ...le,
        materials: lessonIdToMaterials.get(le.id) || [],
      }));
      const sectionDurationSeconds = lessonsForSection.reduce((acc, le) => acc + (le.youtubeDuration || le.duration || 0), 0);
      courseDurationSeconds += sectionDurationSeconds;
      return {
        ...s,
        lessonsCount: lessonsForSection.length,
        durationSeconds: sectionDurationSeconds,
        lessons: lessonsForSection,
      };
    });

    const lecturesCount = lessonRows.length;
    // Convert rating from stored format (multiplied by 10) to display format
    const processedCourse = {
      ...course,
      rating: course.rating ? parseFloat((course.rating / 10).toFixed(1)) : 0,
      lecturesCount,
      courseDurationSeconds,
      sections: sectionsFull
    };
    return res.status(200).json({ success: true, course: processedCourse });
  } catch (error) {
    console.error("getCourseById error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch course" });
  }
};

// Update existing course with final details to avoid duplicate creations
export const updateCourse = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const { courseId } = req.params;
    const input = req.body?.course || {};

    // Get current course to check existing thumbnail
    const [currentCourse] = await db
      .select({
        thumbnailId: courses.thumbnailId,
        thumbnailUrl: images.url,
        thumbnailFileId: images.fileId
      })
      .from(courses)
      .leftJoin(images, eq(courses.thumbnailId, images.id))
      .where(eq(courses.id, courseId));

    let thumbnailIdToSet = undefined;
    let oldThumbnailFileId = null;

    // Handle thumbnail updates
    if (input.thumbnailUrl === null || input.thumbnailUrl === '') {
      // User wants to remove thumbnail
      if (currentCourse?.thumbnailId) {
        oldThumbnailFileId = currentCourse.thumbnailFileId;
        thumbnailIdToSet = null;
      }
    } else if (input.thumbnailUrl && input.thumbnailUrl !== currentCourse?.thumbnailUrl) {
      // User wants to update thumbnail
      if (currentCourse?.thumbnailId) {
        oldThumbnailFileId = currentCourse.thumbnailFileId;
      }
      
      // Create new image record
      const [img] = await db
        .insert(images)
        .values({
          imageType: 'course_thumbnail',
          imageStatus: 'done',
          url: input.thumbnailUrl,
          fileId: input.providerFileId || null,
          filePath: null,
          size: 0,
        })
        .returning();
      thumbnailIdToSet = img?.id;
    }

    // Update course
    const [updated] = await db
      .update(courses)
      .set({
        title: input.title ?? undefined,
        shortDescription: input.shortDescription ?? undefined,
        description: input.description ?? undefined,
        difficulty: input.difficulty ?? undefined,
        tags: Array.isArray(input.tags) ? input.tags : undefined,
        subjectId: input.subjectId ?? null,
        semesterId: input.semesterId ?? null,
        duration: typeof input.duration === 'number' ? input.duration : undefined,
        requirements: Array.isArray(input.requirements) ? input.requirements : undefined,
        learningOutcomes: Array.isArray(input.learningOutcomes) ? input.learningOutcomes : undefined,
        thumbnailId: thumbnailIdToSet ?? undefined,
      })
      .where(eq(courses.id, courseId))
      .returning();

    // Delete old thumbnail from ImageKit if it exists
    if (oldThumbnailFileId) {
      try {
        await deleteImageFromImageKit(oldThumbnailFileId);
        console.log("✅ Old thumbnail deleted from ImageKit:", oldThumbnailFileId);
      } catch (error) {
        console.error("❌ Failed to delete old thumbnail from ImageKit:", error);
        // Don't fail the request if ImageKit deletion fails
      }
    }

    // Delete old image record from database if thumbnail was removed
    if (thumbnailIdToSet === null && currentCourse?.thumbnailId) {
      await db.delete(images).where(eq(images.id, currentCourse.thumbnailId));
    }

    // Invalidate course cache
    await invalidateCourseCache(courseId);
    logger.info(`Invalidated course cache for ${courseId} after update`);

    return res.status(200).json({ success: true, course: updated });
  } catch (error) {
    console.error("updateCourse error:", error);
    return res.status(500).json({ success: false, message: "Failed to update course" });
  }
};

// Update course status (publish/unpublish)
export const updateCourseStatus = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) return res.status(401).json({ success: false, message: "Unauthorized" });
    
    const { courseId } = req.params;
    const { status } = req.body;
    
    if (!courseId) return res.status(400).json({ success: false, message: "courseId is required" });
    if (!status) return res.status(400).json({ success: false, message: "status is required" });
    if (!['draft', 'published', 'archived'].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status. Must be 'draft', 'published', or 'archived'" });
    }

    // Check if course exists and belongs to teacher
    const course = await db.select().from(courses).where(and(eq(courses.id, courseId), eq(courses.teacherId, teacherId))).limit(1);
    if (!course.length) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    // Update course status
    const updated = await db.update(courses)
      .set({ status })
      .where(and(eq(courses.id, courseId), eq(courses.teacherId, teacherId)))
      .returning();

    if (!updated.length) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    // Invalidate course cache
    await invalidateCourseCache(courseId);
    logger.info(`Invalidated course cache for ${courseId} after status update`);

    return res.status(200).json({ success: true, message: `Course ${status} successfully`, course: updated[0] });
  } catch (error) {
    console.error("updateCourseStatus error:", error);
    return res.status(500).json({ success: false, message: "Failed to update course status" });
  }
};

// Update existing section
export const updateSection = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) return res.status(401).json({ success: false, message: "Unauthorized" });
    
    const { courseId, sectionId } = req.params;
    const { title, description, position } = req.body || {};

    if (!title) return res.status(400).json({ success: false, message: "title is required" });

    const [updated] = await db
      .update(sections)
      .set({
        title: title ?? undefined,
        description: description ?? undefined,
        position: position ?? undefined,
      })
      .where(eq(sections.id, sectionId))
      .returning();

    if (!updated) return res.status(404).json({ success: false, message: "Section not found" });
    
    // Invalidate course cache when section is updated
    await invalidateCourseCache(courseId);
    logger.info(`Invalidated course cache for ${courseId} after section update`);

    return res.status(200).json({ success: true, section: updated });
  } catch (error) {
    console.error("updateSection error:", error);
    return res.status(500).json({ success: false, message: "Failed to update section" });
  }
};

// Delete existing section
export const deleteSection = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) return res.status(401).json({ success: false, message: "Unauthorized" });
    
    const { sectionId } = req.params;

    // Get courseId before deleting
    const [sectionToDelete] = await db
      .select({ courseId: sections.courseId })
      .from(sections)
      .where(eq(sections.id, sectionId))
      .limit(1);

    const [deleted] = await db
      .delete(sections)
      .where(eq(sections.id, sectionId))
      .returning();

    if (!deleted) return res.status(404).json({ success: false, message: "Section not found" });
    
    // Invalidate course cache
    if (sectionToDelete?.courseId) {
      await invalidateCourseCache(sectionToDelete.courseId);
      logger.info(`Invalidated course cache for ${sectionToDelete.courseId} after section deletion`);
    }

    return res.status(200).json({ success: true, message: "Section deleted" });
  } catch (error) {
    console.error("deleteSection error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete section" });
  }
};

// Update existing lesson
export const updateLesson = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) return res.status(401).json({ success: false, message: "Unauthorized" });
    
    const { lessonId } = req.params;
    const lessonInput = req.body || {};

    if (!lessonInput.title) return res.status(400).json({ success: false, message: "lesson.title is required" });

    const [updated] = await db
      .update(lessons)
      .set({
        title: lessonInput.title ?? undefined,
        description: lessonInput.description ?? undefined,
        position: lessonInput.position ?? undefined,
        duration: lessonInput.duration ?? undefined,
        youtubeVideoId: lessonInput.youtubeVideoId ?? undefined,
        youtubeUrl: lessonInput.youtubeUrl ?? undefined,
        youtubeEmbedUrl: lessonInput.youtubeEmbedUrl ?? undefined,
        youtubeTitle: lessonInput.youtubeTitle ?? undefined,
        youtubeDescription: lessonInput.youtubeDescription ?? undefined,
        youtubeThumbnail: lessonInput.youtubeThumbnail ?? undefined,
        youtubeDuration: lessonInput.youtubeDuration ?? undefined,
        linkedEventId: lessonInput.linkedEventId !== undefined ? (lessonInput.linkedEventId || null) : undefined, // Added linkedEventId
      })
      .where(eq(lessons.id, lessonId))
      .returning();

    if (!updated) return res.status(404).json({ success: false, message: "Lesson not found" });
    
    // Get courseId from the updated lesson
    const [lessonWithCourse] = await db.select({
      courseId: lessons.courseId,
      title: lessons.title
    })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);

    // Invalidate course cache
    if (lessonWithCourse?.courseId) {
      await invalidateCourseCache(lessonWithCourse.courseId);
      logger.info(`Invalidated course cache for ${lessonWithCourse.courseId} after lesson update`);
    }

    // Notify enrolled students about lesson update
    // NOTE: This creates a NOTIFICATION (not an announcement)
    // Notifications appear in the notification bell, NOT on the announcements page
    if (lessonWithCourse?.courseId) {
      try {
        await notifyCourseStudents(
          lessonWithCourse.courseId,
          'lesson_added', // Notification type - appears in notification bell only
          `Lesson Updated: ${updated.title || lessonInput.title}`,
          `The lesson "${updated.title || lessonInput.title}" has been updated.`,
          { lessonId: lessonId }
        );
      } catch (notificationError) {
        console.error('Error sending lesson update notifications:', notificationError);
        // Don't fail the request if notifications fail
      }
    }

    return res.status(200).json({ success: true, lesson: updated });
  } catch (error) {
    console.error("updateLesson error:", error);
    return res.status(500).json({ success: false, message: "Failed to update lesson" });
  }
};

// Delete existing lesson
export const deleteLesson = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) return res.status(401).json({ success: false, message: "Unauthorized" });
    
    const { lessonId } = req.params;

    // Get courseId before deleting
    const [lessonToDelete] = await db
      .select({ courseId: lessons.courseId })
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);

    const [deleted] = await db
      .delete(lessons)
      .where(eq(lessons.id, lessonId))
      .returning();

    if (!deleted) return res.status(404).json({ success: false, message: "Lesson not found" });
    
    // Invalidate course cache
    if (lessonToDelete?.courseId) {
      await invalidateCourseCache(lessonToDelete.courseId);
      logger.info(`Invalidated course cache for ${lessonToDelete.courseId} after lesson deletion`);
    }

    return res.status(200).json({ success: true, message: "Lesson deleted" });
  } catch (error) {
    console.error("deleteLesson error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete lesson" });
  }
};

// Delete a course owned by the authenticated teacher
export const deleteCourse = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const { courseId } = req.params;

    const [deleted] = await db
      .delete(courses)
      .where(eq(courses.id, courseId))
      .returning();

    if (!deleted) return res.status(404).json({ success: false, message: "Course not found" });
    
    // Invalidate teacher caches
    await invalidateCourseCache(courseId);
    
    return res.status(200).json({ success: true, message: "Course deleted" });
  } catch (error) {
    console.error("deleteCourse error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete course" });
  }
};

export const getEnrolledStudents = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    console.log(`📚 Getting enrolled students for teacher: ${teacherId}`);

    // Simple approach: Get all enrollments first, then filter by teacher's courses
    const allEnrollments = await db.select().from(enrollments);
    console.log(`📚 Found ${allEnrollments.length} total enrollments`);

    // Get teacher's courses
    const teacherCourses = await db.select().from(courses).where(eq(courses.teacherId, teacherId));
    console.log(`📚 Found ${teacherCourses.length} teacher courses`);

    if (teacherCourses.length === 0) {
      const emptyResult = [];
      return res.status(200).json({ 
        success: true, 
        message: "No courses found", 
        students: emptyResult
      });
    }

    const teacherCourseIds = teacherCourses.map(course => course.id);
    console.log(`📚 Teacher course IDs:`, teacherCourseIds);

    // Filter enrollments for teacher's courses
    const relevantEnrollments = allEnrollments.filter(enrollment => 
      teacherCourseIds.includes(enrollment.courseId)
    );
    console.log(`📚 Found ${relevantEnrollments.length} relevant enrollments`);

    // Group by course
    const studentsByCourse = {};
    
    // Initialize course structure
    teacherCourses.forEach(course => {
      studentsByCourse[course.id] = {
        courseId: course.id,
        courseTitle: course.title || 'Untitled Course',
        courseThumbnailUrl: course.thumbnailUrl || null,
        studentCount: course.studentCount || 0,
        students: []
      };
    });

    // Process enrollments
    for (const enrollment of relevantEnrollments) {
      try {
        // Get user details
        const userList = await db.select().from(users).where(eq(users.id, enrollment.userId));
        const user = userList[0];

        if (user && studentsByCourse[enrollment.courseId]) {
          studentsByCourse[enrollment.courseId].students.push({
            enrollmentId: enrollment.id,
            userId: user.id,
            userName: user.name || 'Unknown User',
            userEmail: user.email || 'No email',
            userAvatar: user.avatar || null,
            progressPercent: enrollment.progressPercent || 0,
            enrolledAt: enrollment.createdAt,
            lastAccessedAt: enrollment.updatedAt
          });
        }
      } catch (userError) {
        console.error(`📚 Error fetching user ${enrollment.userId}:`, userError);
      }
    }

    const result = Object.values(studentsByCourse);
    console.log(`📚 Returning ${result.length} courses with students`);

    return res.status(200).json({
      success: true,
      message: "Enrolled students retrieved successfully",
      students: result
    });

  } catch (error) {
    console.error("getEnrolledStudents error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to retrieve enrolled students",
      error: error.message
    });
  }
};

export const unenrollStudent = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { enrollmentId } = req.params;
    
    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!enrollmentId) {
      return res.status(400).json({ success: false, message: "Enrollment ID is required" });
    }

    const result = await transaction(async (tx) => {
      // Get enrollment details to verify teacher owns the course
      const enrollment = await tx
        .select({
          id: enrollments.id,
          courseId: enrollments.courseId,
          userId: enrollments.userId
        })
        .from(enrollments)
        .innerJoin(courses, eq(enrollments.courseId, courses.id))
        .where(and(
          eq(enrollments.id, enrollmentId),
          eq(courses.teacherId, teacherId)
        ));

      if (enrollment.length === 0) {
        throw new Error("Enrollment not found or unauthorized");
      }

      const [enrollmentData] = enrollment;

      // Delete enrollment lessons first
      await tx
        .delete(enrollmentLessons)
        .where(eq(enrollmentLessons.enrollmentId, enrollmentId));

      // Delete the enrollment
      await tx
        .delete(enrollments)
        .where(eq(enrollments.id, enrollmentId));

      // Decrement student count in course
      const [course] = await tx
        .select({ studentCount: courses.studentCount })
        .from(courses)
        .where(eq(courses.id, enrollmentData.courseId));

      if (course) {
        await tx
          .update(courses)
          .set({ 
            studentCount: Math.max(0, course.studentCount - 1),
            updatedAt: new Date()
          })
          .where(eq(courses.id, enrollmentData.courseId));
      }

      return enrollmentData;
    });

    console.log(`📚 Teacher ${teacherId} unenrolled student ${result.userId} from course ${result.courseId}`);

    // Invalidate enrolled students cache

    return res.status(200).json({
      success: true,
      message: "Student unenrolled successfully"
    });

  } catch (error) {
    console.error("unenrollStudent error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to unenroll student" 
    });
  }
};

// Get teacher dashboard statistics
export const getTeacherStats = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    console.log(`📊 Getting teacher stats for: ${teacherId}`);

    // Get teacher's courses
    const teacherCourses = await db.select().from(courses).where(eq(courses.teacherId, teacherId));
    const totalCourses = teacherCourses.length;

    // Get total enrollments for teacher's courses
    const courseIds = teacherCourses.map(course => course.id);
    let totalEnrollments = 0;
    let totalStudents = 0;
    let recentEnrollments = [];

    if (courseIds.length > 0) {
      const allEnrollments = await db.select().from(enrollments);
      const relevantEnrollments = allEnrollments.filter(enrollment => 
        courseIds.includes(enrollment.courseId)
      );
      
      totalEnrollments = relevantEnrollments.length;
      
      // Get unique students
      const uniqueStudentIds = [...new Set(relevantEnrollments.map(e => e.userId))];
      totalStudents = uniqueStudentIds.length;

      // Get recent enrollments (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      recentEnrollments = relevantEnrollments
        .filter(enrollment => new Date(enrollment.createdAt) >= sevenDaysAgo)
        .slice(0, 5); // Last 5 recent enrollments
    }

    // Calculate total revenue (if courses have prices)
    const totalRevenue = teacherCourses.reduce((sum, course) => sum + (course.price || 0), 0);

    // Get course status distribution
    const courseStatusStats = {
      published: teacherCourses.filter(c => c.status === 'published').length,
      draft: teacherCourses.filter(c => c.status === 'draft').length,
      archived: teacherCourses.filter(c => c.status === 'archived').length
    };

    // Get enrollment trends (last 6 months)
    const enrollmentTrends = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const monthEnrollments = await db.select().from(enrollments)
        .where(
          and(
            inArray(enrollments.courseId, courseIds),
            sql`${enrollments.createdAt} >= ${monthStart.toISOString()}`,
            sql`${enrollments.createdAt} <= ${monthEnd.toISOString()}`
          )
        );
      
      enrollmentTrends.push({
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        enrollments: monthEnrollments.length
      });
    }

    const stats = {
      totalCourses,
      totalStudents,
      totalEnrollments,
      totalRevenue,
      courseStatusStats,
      enrollmentTrends,
      recentEnrollments: recentEnrollments.length
    };

    console.log(`📊 Teacher stats:`, stats);

    return res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error("getTeacherStats error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch teacher statistics",
      error: error.message
    });
  }
};