import { db } from "../../config/database.js"
import { users } from "../../models/user.model.js"
import logger from "../../utils/logger.js"
import { eq, sql } from "drizzle-orm"


//admin get all users
export const getAllUsersAdmin = async (req, res) => {
    try {
        logger.info("hitting getAllUsers - Admin")
        
        // Get pagination parameters
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const offset = (page - 1) * limit
        
        console.log("📄 User pagination params:", { page, limit, offset })
        
        // Get total count for pagination
        const totalCountResult = await db.select({ count: sql`count(*)` }).from(users)
        const totalCount = parseInt(totalCountResult[0].count)
        const totalPages = Math.ceil(totalCount / limit)
        
        console.log("📊 Total users:", totalCount, "Total pages:", totalPages)

        const allUsers = await db.select().from(users)
            .limit(limit)
            .offset(offset)
            .orderBy(users.createdAt)

        logger.info(`fetched ${allUsers.length} users (page=${page}, limit=${limit})`)

        return res.status(200).json({
            success: true,
            message: 'Users fetched successfully',
            data: allUsers,
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
        logger.error("error in admin getting all users..", error)
        return res.status(500).json({ success: false, message: 'Failed to fetch users' })
    }
}

// admin get single user by id
export const getUserByIdAdmin = async (req, res) => {
    try {
        const { id } = req.params
        logger.info(`hitting getUserById - Admin id=${id}`)

        const result = await db.select().from(users).where(eq(users.id, id))
        if (result.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' })
        }

        return res.status(200).json({ success: true, user: result[0] })
    } catch (error) {
        logger.error("error in admin get user by id..", error)
        return res.status(500).json({ success: false, message: 'Failed to get user' })
    }
}

// admin delete user by id
export const deleteUserByIdByAdmin = async (req, res) => {
    try {
        const { id } = req.params
        logger.info(`hitting deleteUserById - Admin id=${id}`)

        const existing = await db.select().from(users).where(eq(users.id, id))
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' })
        }

        await db.delete(users).where(eq(users.id, id))
        return res.status(200).json({ success: true, message: 'User deleted' })
    } catch (error) {
        logger.error("error in admin deleting user..", error)
        return res.status(500).json({ success: false, message: 'Failed to delete user' })
    }
}

// admin change user role
export const changeUserRole = async (req, res) => {
    try {
        logger.info("hitting user role change..")
        const { role } = req.params
        const { id } = req.body

        const allowedRoles = ['student', 'teacher', 'admin']
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ success: false, message: 'Invalid role' })
        }
        if (!id) {
            return res.status(400).json({ success: false, message: 'User id is required in body' })
        }

        const existing = await db.select().from(users).where(eq(users.id, id))
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' })
        }

        await db.update(users).set({ role }).where(eq(users.id, id))
        return res.status(200).json({ success: true, message: 'Role updated', userId: id, role })
    } catch (error) {
        logger.error("changing user role error..", error)
        return res.status(500).json({ success: false, message: 'Failed to change user role' })
    }
}





