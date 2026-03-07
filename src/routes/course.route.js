import express from 'express'
import { getAllCourses, getCourseById, getCoursesByCategory } from '../controllers/course/course.controller.js'

const router = express.Router()

// Public routes for course browsing
router.get('/all', getAllCourses)
router.get('/:courseId', getCourseById)
router.get('/category/:category', getCoursesByCategory)

export default router
