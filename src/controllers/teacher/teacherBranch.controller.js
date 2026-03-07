import { db } from "../../config/database.js";
import { eq, sql } from "drizzle-orm";
import { colleges, branches, semesters, subjects } from "../../models/branch.model.js";
import { images } from "../../models/document.model.js";

export const getAllColleges = async (req, res) => {
  try {
    console.log('🏫 Fetching colleges with logos...');
    
    // Get pagination parameters from query
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    console.log('🏫 Pagination params:', { page, limit, offset });
    
    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: sql`count(*)` })
      .from(colleges);
    const totalCount = parseInt(totalCountResult[0].count);
    const totalPages = Math.ceil(totalCount / limit);
    
    console.log('🏫 Total colleges:', totalCount, 'Total pages:', totalPages);
    
    // Get paginated data with logos
    const data = await db
      .select({
        id: colleges.id,
        name: colleges.name,
        location: colleges.location,
        logoId: colleges.LogoId,
        createdAt: colleges.createdAt,
        logoUrl: images.url,
        logoFileId: images.fileId,
        logoSize: images.size
      })
      .from(colleges)
      .leftJoin(images, eq(colleges.LogoId, images.id))
      .limit(limit)
      .offset(offset);
    
    console.log('🏫 College data (page', page, '):', data.length, 'colleges');
    
    return res.status(200).json({ 
      success: true, 
      data,
      pagination: {
        totalCount,
        totalPages,
        currentPage: page,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('🏫 Error fetching colleges:', error);
    return res.status(500).json({ success: false, message: "Failed to fetch colleges", error: String(error) });
  }
};

export const getAllBranches = async (req, res) => {
  try {
    const data = await db.select().from(branches);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch branches", error: String(error) });
  }
};

export const getAllSemesters = async (req, res) => {
  try {
    const data = await db.select().from(semesters);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch semesters", error: String(error) });
  }
};

export const getAllSubjects = async (req, res) => {
  try {
    const data = await db.select().from(subjects);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch subjects", error: String(error) });
  }
};

export const getSubjectsBySemester = async (req, res) => {
  try {
    const { semesterId } = req.params;
    const data = await db.select().from(subjects).where(eq(subjects.semesterId, semesterId));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch subjects for semester", error: String(error) });
  }
};

export const getSemestersByBranch = async (req, res) => {
  try {
    const { branchId } = req.params;
    const data = await db.select().from(semesters).where(eq(semesters.branchId, branchId));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch semesters for branch", error: String(error) });
  }
};


