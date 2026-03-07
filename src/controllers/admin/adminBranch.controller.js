import logger from "../../utils/logger.js"
import { db } from "../../config/database.js"
import { colleges, branches, semesters, subjects } from "../../models/branch.model.js"
import { images } from "../../models/document.model.js"
import { eq, inArray, sql } from "drizzle-orm"
import { uploadSingleImage, deleteImageFromImageKit } from "../../services/imagekit.js"

//-----------college management-------------------

//create college
export const createCollegeByAdmin = async (req, res) => {
    try {
        console.log("🏫 Creating college...")
        console.log("📋 Request body:", req.body)
        console.log("📁 Request files:", req.files ? req.files.map(f => ({ name: f.originalname, size: f.size, mimetype: f.mimetype })) : "No files")
        
        const { name, location } = req.body
        const logoFile = req.file // Single file upload

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "College name is required"
            })
        }

        console.log("📝 Creating college with data:", { name, location })

        // Create college first
        const newCollege = await db.insert(colleges).values({
            name,
            location,
            LogoId: null // Will be updated if logo is uploaded
        }).returning()

        console.log("✅ College created:", newCollege[0])

        let logoImage = null

        // If logo file is provided, upload it
        if (logoFile) {
            try {
                console.log("🖼️ Uploading logo to ImageKit...")
                const logoResult = await uploadSingleImage(logoFile, "/uploads/images/profile")
                console.log("✅ Logo uploaded to ImageKit:", logoResult)

                // Save image to database
                const imageRecord = {
                    imageType: "profile",
                    imageStatus: "done",
                    url: logoResult.url,
                    fileId: logoResult.fileId,
                    size: logoResult.fileSize || 0,
                }

                console.log("💾 Saving logo to database:", imageRecord)
                const insertedImage = await db.insert(images).values(imageRecord).returning()
                console.log("✅ Logo saved to database:", insertedImage[0])

                // Update college with logo ID
                await db.update(colleges)
                    .set({ LogoId: insertedImage[0].id })
                    .where(eq(colleges.id, newCollege[0].id))

                console.log("🔗 College updated with logo ID:", insertedImage[0].id)
                logoImage = insertedImage[0]
            } catch (logoError) {
                console.error("❌ Error uploading logo:", logoError)
                // Don't fail the entire request if logo upload fails
                logger.error("Logo upload failed, but college was created:", logoError)
            }
        }

        // Fetch the final college data with logo
        const finalCollege = await db.select().from(colleges).where(eq(colleges.id, newCollege[0].id)).limit(1)
        
        let collegeWithLogo = {
            ...finalCollege[0],
            logo: logoImage
        }

        console.log("🎉 College creation completed:", collegeWithLogo)

        logger.info("College created successfully:", collegeWithLogo)
        return res.status(201).json({
            success: true,
            message: "College created successfully",
            data: collegeWithLogo
        })
    } catch (error) {
        console.error("❌ Error in creating college:", error)
        logger.error("Error in creating college:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to create college",
            error: error.message
        })
    }
}

//get all colleges
export const getAllCollgesByAdmin = async (req, res) => {
    try {
        console.log("🏫 Fetching all colleges...")
        
        // Get pagination parameters
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const offset = (page - 1) * limit
        
        console.log("📄 Pagination params:", { page, limit, offset })
        
        // Get total count for pagination
        const totalCountResult = await db.select({ count: sql`count(*)` }).from(colleges)
        const totalCount = parseInt(totalCountResult[0].count)
        const totalPages = Math.ceil(totalCount / limit)
        
        console.log("📊 Total count:", totalCount, "Total pages:", totalPages)
        
        // First get colleges with pagination
        const allColleges = await db.select().from(colleges)
            .limit(limit)
            .offset(offset)
            .orderBy(colleges.createdAt)
        
        console.log("📋 Colleges for page:", allColleges.length)
        
        // Then get all images for these colleges
        const collegeIds = allColleges.map(college => college.LogoId).filter(Boolean)
        console.log("🖼️ College logo IDs:", collegeIds)
        let collegeImages = []
        
        if (collegeIds.length > 0) {
            collegeImages = await db.select().from(images).where(
                inArray(images.id, collegeIds)
            )
            console.log("🖼️ College images:", collegeImages)
        }
        
        // Create a map of image data
        const imageMap = new Map()
        collegeImages.forEach(image => {
            imageMap.set(image.id, image)
        })
        
        // Combine colleges with their logo data
        const collegesWithLogos = allColleges.map(college => ({
            id: college.id,
            name: college.name,
            location: college.location,
            logoId: college.LogoId,
            createdAt: college.createdAt,
            logo: college.LogoId ? imageMap.get(college.LogoId) || null : null
        }))
        
        console.log("🏫 Colleges with logos:", collegesWithLogos.length)
        
        return res.status(200).json({
            success: true,
            message: "Colleges fetched successfully",
            data: collegesWithLogos,
            pagination: {
                currentPage: page,
                totalPages,
                totalCount,
                limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        })
    } catch (error) {
        console.error("❌ Error fetching colleges:", error)
        logger.error("Error fetching colleges:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to fetch colleges",
            error: error.message
        })
    }
}

//get college by Id
export const getCollegeByIdAdmin = async (req, res) => {
    try {
        const { id } = req.params
        logger.info("Fetching college by ID:", id)

        const college = await db.select().from(colleges).where(eq(colleges.id, id)).limit(1)

        if (!college.length) {
            return res.status(404).json({
                success: false,
                message: "College not found"
            })
        }

        return res.status(200).json({
            success: true,
            message: "College fetched successfully",
            data: college[0]
        })
    } catch (error) {
        logger.error("Error fetching college by ID:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to fetch college",
            error: error.message
        })
    }
}

//update college
export const updateCollegeByIdAdmin = async (req, res) => {
    try {
        const { id } = req.params
        const { name, location, logoId } = req.body
        const logoFile = req.file // New logo file if provided
        
        console.log("🏫 Updating college:", { id, name, location, logoId, hasNewLogo: !!logoFile })
        
        // Get current college data
        const currentCollege = await db.select().from(colleges).where(eq(colleges.id, id)).limit(1)
        
        if (!currentCollege.length) {
            return res.status(404).json({
                success: false,
                message: "College not found"
            })
        }

        let newLogoId = logoId || currentCollege[0].LogoId

        // If new logo file is provided, upload it and delete old one
        if (logoFile) {
            try {
                console.log("🖼️ Uploading new logo to ImageKit...")
                const logoResult = await uploadSingleImage(logoFile, "/uploads/images/profile")
                console.log("✅ New logo uploaded to ImageKit:", logoResult)

                // Save new image to database
                const imageRecord = {
                    imageType: "profile",
                    imageStatus: "done",
                    url: logoResult.url,
                    fileId: logoResult.fileId,
                    size: logoResult.fileSize || 0,
                }

                console.log("💾 Saving new logo to database:", imageRecord)
                const insertedImage = await db.insert(images).values(imageRecord).returning()
                console.log("✅ New logo saved to database:", insertedImage[0])

                // Delete old image from ImageKit and database if exists
                if (currentCollege[0].LogoId) {
                    try {
                        const oldImage = await db.select().from(images).where(eq(images.id, currentCollege[0].LogoId)).limit(1)
                        if (oldImage.length && oldImage[0].fileId) {
                            console.log("🗑️ Deleting old logo from ImageKit:", oldImage[0].fileId)
                            await deleteImageFromImageKit(oldImage[0].fileId)
                            
                            // Delete old image record from database
                            await db.delete(images).where(eq(images.id, currentCollege[0].LogoId))
                            console.log("✅ Old logo deleted from ImageKit and database")
                        }
                    } catch (deleteError) {
                        console.error("❌ Error deleting old logo:", deleteError)
                        // Don't fail the update if old logo deletion fails
                    }
                }

                newLogoId = insertedImage[0].id
            } catch (logoError) {
                console.error("❌ Error uploading new logo:", logoError)
                return res.status(500).json({
                    success: false,
                    message: "Failed to upload new logo",
                    error: logoError.message
                })
            }
        }

        // Update college
        const updatedCollege = await db.update(colleges)
            .set({
                name,
                location,
                LogoId: newLogoId
            })
            .where(eq(colleges.id, id))
            .returning()

        console.log("✅ College updated successfully:", updatedCollege[0])

        logger.info("College updated successfully")
        return res.status(200).json({
            success: true,
            message: "College updated successfully",
            data: updatedCollege[0]
        })
    } catch (error) {
        console.error("❌ Error updating college:", error)
        logger.error("Error updating college:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to update college",
            error: error.message
        })
    }
}

//delete college
export const deleteCollegeByIdAdmin = async (req, res) => {
    try {
        const { id } = req.params
        console.log("🏫 Deleting college:", id)

        // Get college data first to access logo
        const collegeToDelete = await db.select().from(colleges).where(eq(colleges.id, id)).limit(1)
        
        if (!collegeToDelete.length) {
            return res.status(404).json({
                success: false,
                message: "College not found"
            })
        }

        // Delete associated image from ImageKit and database if exists
        if (collegeToDelete[0].LogoId) {
            try {
                const imageToDelete = await db.select().from(images).where(eq(images.id, collegeToDelete[0].LogoId)).limit(1)
                if (imageToDelete.length && imageToDelete[0].fileId) {
                    console.log("🗑️ Deleting college logo from ImageKit:", imageToDelete[0].fileId)
                    await deleteImageFromImageKit(imageToDelete[0].fileId)
                    
                    // Delete image record from database
                    await db.delete(images).where(eq(images.id, collegeToDelete[0].LogoId))
                    console.log("✅ College logo deleted from ImageKit and database")
                }
            } catch (deleteError) {
                console.error("❌ Error deleting college logo:", deleteError)
                // Don't fail the college deletion if image deletion fails
            }
        }

        // Delete college
        const deletedCollege = await db.delete(colleges)
            .where(eq(colleges.id, id))
            .returning()

        console.log("✅ College deleted successfully:", deletedCollege[0])

        logger.info("College deleted successfully")
        return res.status(200).json({
            success: true,
            message: "College deleted successfully",
            data: deletedCollege[0]
        })
    } catch (error) {
        console.error("❌ Error deleting college:", error)
        logger.error("Error deleting college:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to delete college",
            error: error.message
        })
    }
}




//------------branch managemnet----------------

//create branch
export const createBranchByAdmin = async (req, res) => {
    try {
        logger.info("Creating branch...")
        const { name, code, description } = req.body

        if (!name || !code) {
            return res.status(400).json({
                success: false,
                message: "Branch name and code are required"
            })
        }

        const newBranch = await db.insert(branches).values({
            name,
            code: code.toUpperCase(),
            description
        }).returning()

        logger.info("Branch created successfully:", newBranch[0])
        return res.status(201).json({
            success: true,
            message: "Branch created successfully",
            data: newBranch[0]
        })
    } catch (error) {
        logger.error("Error in creating branch:", error)
        if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({
                success: false,
                message: "Branch code already exists"
            })
        }
        return res.status(500).json({
            success: false,
            message: "Failed to create branch",
            error: error.message
        })
    }
}

//get all branch
export const getAllBranchByAdmin = async (req, res) => {
    try {
        logger.info("Fetching all branches...")
        
        // Get pagination parameters
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const offset = (page - 1) * limit
        
        // Get total count for pagination
        const totalCountResult = await db.select({ count: sql`count(*)` }).from(branches)
        const totalCount = parseInt(totalCountResult[0].count)
        const totalPages = Math.ceil(totalCount / limit)
        
        const allBranches = await db.select().from(branches)
            .limit(limit)
            .offset(offset)
            .orderBy(branches.createdAt)

        return res.status(200).json({
            success: true,
            message: "Branches fetched successfully",
            data: allBranches,
            pagination: {
                currentPage: page,
                totalPages,
                totalCount,
                limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        })
    } catch (error) {
        logger.error("Error fetching branches:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to fetch branches",
            error: error.message
        })
    }
}

//get branch by id
export const getBranchByIdAdmin = async (req, res) => {
    try {
        const { id } = req.params
        logger.info("Fetching branch by ID:", id)

        const branch = await db.select().from(branches).where(eq(branches.id, id)).limit(1)

        if (!branch.length) {
            return res.status(404).json({
                success: false,
                message: "Branch not found"
            })
        }

        return res.status(200).json({
            success: true,
            message: "Branch fetched successfully",
            data: branch[0]
        })
    } catch (error) {
        logger.error("Error fetching branch by ID:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to fetch branch",
            error: error.message
        })
    }
}

//update branch
export const updateBranchByIdAdmin = async (req, res) => {
    try {
        const { id } = req.params
        const { name, code, description } = req.body
        logger.info("Updating branch:", id)

        const updatedBranch = await db.update(branches)
            .set({
                name,
                code: code?.toUpperCase(),
                description
            })
            .where(eq(branches.id, id))
            .returning()

        if (!updatedBranch.length) {
            return res.status(404).json({
                success: false,
                message: "Branch not found"
            })
        }

        logger.info("Branch updated successfully")
        return res.status(200).json({
            success: true,
            message: "Branch updated successfully",
            data: updatedBranch[0]
        })
    } catch (error) {
        logger.error("Error updating branch:", error)
        if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({
                success: false,
                message: "Branch code already exists"
            })
        }
        return res.status(500).json({
            success: false,
            message: "Failed to update branch",
            error: error.message
        })
    }
}

//delete Branch
export const deleteBranchByIdAdmin = async (req, res) => {
    try {
        const { id } = req.params
        logger.info("Deleting branch:", id)

        const deletedBranch = await db.delete(branches)
            .where(eq(branches.id, id))
            .returning()

        if (!deletedBranch.length) {
            return res.status(404).json({
                success: false,
                message: "Branch not found"
            })
        }

        logger.info("Branch deleted successfully")
        return res.status(200).json({
            success: true,
            message: "Branch deleted successfully",
            data: deletedBranch[0]
        })
    } catch (error) {
        logger.error("Error deleting branch:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to delete branch",
            error: error.message
        })
    }
}

//-------------semester managemnet-------------


//create sem
export const createSemester = async (req, res) => {
    try {
        logger.info("Creating semester...")
        const { branchId, name, semesterNumber } = req.body

        if (!branchId || !name || !semesterNumber) {
            return res.status(400).json({
                success: false,
                message: "Branch ID, name, and semester number are required"
            })
        }

        const newSemester = await db.insert(semesters).values({
            branchId,
            name,
            semesterNumber: parseInt(semesterNumber)
        }).returning()

        logger.info("Semester created successfully:", newSemester[0])
        return res.status(201).json({
            success: true,
            message: "Semester created successfully",
            data: newSemester[0]
        })
    } catch (error) {
        logger.error("Error in creating semester:", error)
        if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({
                success: false,
                message: "Semester number already exists for this branch"
            })
        }
        return res.status(500).json({
            success: false,
            message: "Failed to create semester",
            error: error.message
        })
    }
}

//get all semester
export const getAllSemester = async (req, res) => {
    try {
        logger.info("Fetching all semesters...")
        
        // Get pagination parameters
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const offset = (page - 1) * limit
        
        // Get total count for pagination
        const totalCountResult = await db.select({ count: sql`count(*)` }).from(semesters)
        const totalCount = parseInt(totalCountResult[0].count)
        const totalPages = Math.ceil(totalCount / limit)
        
        const allSemesters = await db.select().from(semesters)
            .limit(limit)
            .offset(offset)
            .orderBy(semesters.createdAt)

        return res.status(200).json({
            success: true,
            message: "Semesters fetched successfully",
            data: allSemesters,
            pagination: {
                currentPage: page,
                totalPages,
                totalCount,
                limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        })
    } catch (error) {
        logger.error("Error fetching semesters:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to fetch semesters",
            error: error.message
        })
    }
}

//get sem by id
export const getSemesterById = async (req, res) => {
    try {
        const { id } = req.params
        logger.info("Fetching semester by ID:", id)

        const semester = await db.select().from(semesters).where(eq(semesters.id, id)).limit(1)

        if (!semester.length) {
            return res.status(404).json({
                success: false,
                message: "Semester not found"
            })
        }

        return res.status(200).json({
            success: true,
            message: "Semester fetched successfully",
            data: semester[0]
        })
    } catch (error) {
        logger.error("Error fetching semester by ID:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to fetch semester",
            error: error.message
        })
    }
}

//update semester
export const updateSemesterById = async (req, res) => {
    try {
        const { id } = req.params
        const { branchId, name, semesterNumber } = req.body
        logger.info("Updating semester:", id)

        const updatedSemester = await db.update(semesters)
            .set({
                branchId,
                name,
                semesterNumber: semesterNumber ? parseInt(semesterNumber) : undefined
            })
            .where(eq(semesters.id, id))
            .returning()

        if (!updatedSemester.length) {
            return res.status(404).json({
                success: false,
                message: "Semester not found"
            })
        }

        logger.info("Semester updated successfully")
        return res.status(200).json({
            success: true,
            message: "Semester updated successfully",
            data: updatedSemester[0]
        })
    } catch (error) {
        logger.error("Error updating semester:", error)
        if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({
                success: false,
                message: "Semester number already exists for this branch"
            })
        }
        return res.status(500).json({
            success: false,
            message: "Failed to update semester",
            error: error.message
        })
    }
}

//delete semester
export const deleteSemesterById = async (req, res) => {
    try {
        const { id } = req.params
        logger.info("Deleting semester:", id)

        const deletedSemester = await db.delete(semesters)
            .where(eq(semesters.id, id))
            .returning()

        if (!deletedSemester.length) {
            return res.status(404).json({
                success: false,
                message: "Semester not found"
            })
        }

        logger.info("Semester deleted successfully")
        return res.status(200).json({
            success: true,
            message: "Semester deleted successfully",
            data: deletedSemester[0]
        })
    } catch (error) {
        logger.error("Error deleting semester:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to delete semester",
            error: error.message
        })
    }
}


//------ subject managment ----------


export const createSubjectByAdmin = async (req, res) => {
    try {
        logger.info("Creating subject...")
        const { semesterId, name, code, description } = req.body

        if (!name || !code) {
            return res.status(400).json({
                success: false,
                message: "Name and code are required"
            })
        }

        const newSubject = await db.insert(subjects).values({
            semesterId: semesterId || null, // Allow null for unassigned subjects
            name,
            code: code.toUpperCase(),
            description
        }).returning()

        logger.info("Subject created successfully:", newSubject[0])
        return res.status(201).json({
            success: true,
            message: "Subject created successfully",
            data: newSubject[0]
        })
    } catch (error) {
        logger.error("Error in creating subject:", error)
        if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({
                success: false,
                message: "Subject code already exists for this semester"
            })
        }
        return res.status(500).json({
            success: false,
            message: "Failed to create subject",
            error: error.message
        })
    }
}

//get all subjects
export const getAllSubjectByAdmin = async (req, res) => {
    try {
        logger.info("Fetching all subjects...")
        
        // Get pagination parameters
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const offset = (page - 1) * limit
        
        // Get total count for pagination
        const totalCountResult = await db.select({ count: sql`count(*)` }).from(subjects)
        const totalCount = parseInt(totalCountResult[0].count)
        const totalPages = Math.ceil(totalCount / limit)
        
        const allSubjects = await db.select().from(subjects)
            .limit(limit)
            .offset(offset)
            .orderBy(subjects.createdAt)

        return res.status(200).json({
            success: true,
            message: "Subjects fetched successfully",
            data: allSubjects,
            pagination: {
                currentPage: page,
                totalPages,
                totalCount,
                limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        })
    } catch (error) {
        logger.error("Error fetching subjects:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to fetch subjects",
            error: error.message
        })
    }
}

//get subject by id
export const getSubjectByIdAdmin = async (req, res) => {
    try {
        const { id } = req.params
        logger.info("Fetching subject by ID:", id)

        const subject = await db.select().from(subjects).where(eq(subjects.id, id)).limit(1)

        if (!subject.length) {
            return res.status(404).json({
                success: false,
                message: "Subject not found"
            })
        }

        return res.status(200).json({
            success: true,
            message: "Subject fetched successfully",
            data: subject[0]
        })
    } catch (error) {
        logger.error("Error fetching subject by ID:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to fetch subject",
            error: error.message
        })
    }
}

//update subject
export const updateSubjectByIdAdmin = async (req, res) => {
    try {
        const { id } = req.params
        const { semesterId, name, code, description } = req.body
        logger.info("Updating subject:", id)

        const updatedSubject = await db.update(subjects)
            .set({
                semesterId: semesterId || null, // Allow null for unassigned subjects
                name,
                code: code?.toUpperCase(),
                description
            })
            .where(eq(subjects.id, id))
            .returning()

        if (!updatedSubject.length) {
            return res.status(404).json({
                success: false,
                message: "Subject not found"
            })
        }

        logger.info("Subject updated successfully")
        return res.status(200).json({
            success: true,
            message: "Subject updated successfully",
            data: updatedSubject[0]
        })
    } catch (error) {
        logger.error("Error updating subject:", error)
        if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({
                success: false,
                message: "Subject code already exists for this semester"
            })
        }
        return res.status(500).json({
            success: false,
            message: "Failed to update subject",
            error: error.message
        })
    }
}

//delete subject
export const deleteSubjectByIdAdmin = async (req, res) => {
    try {
        const { id } = req.params
        logger.info("Deleting subject:", id)

        const deletedSubject = await db.delete(subjects)
            .where(eq(subjects.id, id))
            .returning()

        if (!deletedSubject.length) {
            return res.status(404).json({
                success: false,
                message: "Subject not found"
            })
        }

        logger.info("Subject deleted successfully")
        return res.status(200).json({
            success: true,
            message: "Subject deleted successfully",
            data: deletedSubject[0]
        })
    } catch (error) {
        logger.error("Error deleting subject:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to delete subject",
            error: error.message
        })
    }
}