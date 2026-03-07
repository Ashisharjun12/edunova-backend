import { Router } from "express";
import { authenticate } from "../middleware/autenticate.js";
import { customrole } from "../middleware/customRole.js";
import { generatePresignedUrl } from "../services/imagekit.js";

const router = Router();

// Get ImageKit auth params for client-side upload
router.get('/auth', authenticate, async (req, res) => {
  try {
    const { fileName = 'material', folder = '/uploads/materials', fileType = 'application/octet-stream' } = req.query;
    const data = await generatePresignedUrl(String(fileName), String(folder), String(fileType));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get ImageKit auth', error: String(error) });
  }
});

export default router;
