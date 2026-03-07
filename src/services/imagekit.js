import imagekit from "imagekit";
import { _config } from "../config/config.js";



export const Imagekit = new imagekit({
  publicKey: _config.IMAGEKIT_PUBLIC_KEY,
  privateKey: _config.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: _config.IMAGEKIT_ENDPOINT,
});

// Export Imagekit instance (for direct use)
export { Imagekit as ImageKit };


//generate presigned url for image upload or video upload
export const generatePresignedUrl = async (fileName, folder = "/uploads/images",fileType) => {
  try {
    console.log("🔗 Generating presigned URL for image upload:", { fileName, folder,fileType });
    const result = await Imagekit.getAuthenticationParameters();
    if (!result || !result.token || !result.signature) {
      throw new Error('Failed to get authentication parameters from ImageKit');
    }
    const presignedData = {
      token: result.token,
      signature: result.signature,
      expire: result.expire,
      publicKey: _config.IMAGEKIT_PUBLIC_KEY,
      urlEndpoint: _config.IMAGEKIT_ENDPOINT,
      folder,
      fileName,
      fileType
    };
    return presignedData;
   
  } catch (error) {
    console.error("❌ Error generating presigned URL:", error);
    throw error;
  }
};







// //upload single image

export const uploadSingleImage = async (file, folder = "/uploads/images") => {
  try {
    console.log("📤 Uploading single image:", {
      fileName: file.originalname,
      fileSize: file.size,
      mimetype: file.mimetype,
      folder: folder,
      hasBuffer: !!file.buffer
    });

    const timestamp = Date.now();
    const fileExtension = file.originalname.split(".").pop();
    const filename = `image_${timestamp}_${Math.random().toString(36).substring(7)}.${fileExtension}`

    const result = await Imagekit.upload({
      file: file.buffer,
      fileName: filename,
      folder: folder,
      isBase64: false
    });

    console.log("✅ ImageKit upload successful:", {
      url: result.url,
      fileId: result.fileId,
      fileName: filename
    });

    return {
      url: result.url,
      fileId: result.fileId,
      fileName: filename,
      fileType: file.mimetype,
      originalName: file.originalname,
      fileSize: file.size || 0,
    };
  } catch (error) {
    console.error("❌ Error uploading image:", error);
    throw error;
  }
};

// //upload multiple images
// export const multipleImageUpload = async (files, folder = "/uploads/images") => {
//   try {
//     console.log("📤 Starting multiple image upload:", {
//       filesCount: Array.isArray(files) ? files.length : 1,
//       folder: folder
//     });

//     if(!Array.isArray(files)){
//         files = [files]
//     }

//     const uploadedImages = [];

//     for (const file of files) {
//       console.log("🔄 Processing file:", file.originalname);
//       const result = await uploadSingleImage(file, folder);
//       uploadedImages.push(result);
//     }

//     console.log("✅ All images uploaded successfully:", uploadedImages.length);
//     return uploadedImages;
//   } catch (error) {
//     console.error("❌ Error in uploading multiple images:", error);
//     throw error;
//   }
// };

//delete image from ImageKit
export const deleteImageFromImageKit = async (fileId) => {
  try {
    console.log(" Deleting image from ImageKit:", { fileId });

    const result = await Imagekit.deleteFile(fileId);
    
    console.log("✅ Image deleted from ImageKit successfully:", { fileId });
    return result;
  } catch (error) {
    console.error("❌ Error deleting image from ImageKit:", error);
    throw error;
  }
};

//upload video to ImageKit
export const uploadVideoToImageKit = async (file, folder = "/uploads/videos") => {
  try {
    console.log("📤 Uploading video:", {
      fileName: file.originalname,
      fileSize: file.size,
      mimetype: file.mimetype,
      folder: folder,
      hasBuffer: !!file.buffer
    });

    const timestamp = Date.now();
    const fileExtension = file.originalname.split(".").pop();
    const filename = `video_${timestamp}_${Math.random().toString(36).substring(7)}.${fileExtension}`;

    const result = await Imagekit.upload({
      file: file.buffer,
      fileName: filename,
      folder: folder,
      isBase64: false
    });

    console.log("✅ Video uploaded to ImageKit:", {
      url: result.url,
      fileId: result.fileId,
      fileName: filename
    });

    return {
      success: true,
      url: result.url,
      fileId: result.fileId,
      fileName: filename,
      fileType: file.mimetype,
      originalName: file.originalname,
      fileSize: file.size || 0,
      duration: 0, 
      resolution: "1080p" 
    };
  } catch (error) {
    console.error("❌ Error uploading video:", error);
    return {
      success: false,
      message: error.message || 'Failed to upload video to ImageKit'
    };
  }
};

//generate HLS streaming URL with adaptive bitrate
export const generateHLSStream = (fileId, transformations = "sr-240_360_480_720_1080") => {
  try {

    // Using the format from ImageKit demo: https://ik.imagekit.io/demo/sample-video.mp4/ik-master.m3u8?tr=sr-240_360_480_720_1080
    const urlEndpoint = _config.IMAGEKIT_ENDPOINT;
    
    if (!urlEndpoint) {
      throw new Error('IMAGEKIT_ENDPOINT is not configured');
    }
    
    if (!fileId) {
      throw new Error('fileId is required for HLS stream generation');
    }
    
    const hlsUrl = `${urlEndpoint}/${fileId}/ik-master.m3u8?tr=${transformations}`;
    
    console.log("🎬 Generated HLS streaming URL:", hlsUrl);
    return hlsUrl;
  } catch (error) {
    console.error("❌ Error generating HLS stream:", error);
    throw error;
  }
};

//generate presigned URL for video upload
export const generatePresignedVideoUploadUrl = async (fileName, folder = "/uploads/videos") => {
  try {
    console.log("🔗 Generating presigned URL for video upload:", { fileName, folder });

    if (!fileName) {
      throw new Error('fileName is required for presigned URL generation');
    }

    const result = await Imagekit.getAuthenticationParameters();
    
    if (!result || !result.token || !result.signature) {
      throw new Error('Failed to get authentication parameters from ImageKit');
    }
    
    const presignedData = {
      token: result.token,
      signature: result.signature,
      expire: result.expire,
      publicKey: _config.IMAGEKIT_PUBLIC_KEY,
      urlEndpoint: _config.IMAGEKIT_ENDPOINT,
      folder: folder,
      fileName: fileName
    };

    console.log("✅ Presigned URL generated successfully", presignedData);

    return presignedData;
  } catch (error) {
    console.error("❌ Error generating presigned URL:", error);
    throw error;
  }
};


//delete video from ImageKit
export const deleteVideoFromImageKit = async (fileId) => {
  try {
    console.log("🗑️ Deleting video from ImageKit:", { fileId });

    const result = await Imagekit.deleteFile(fileId);
    
    console.log("✅ Video deleted from ImageKit successfully:", { fileId });
    return result;
  } catch (error) {
    console.error("❌ Error deleting video from ImageKit:", error);
    throw error;
  }
};

//upload PDF to ImageKit
export const uploadPDFToImageKit = async (file, folder = "/uploads/assignments") => {
  try {
    console.log("📤 Uploading PDF:", {
      fileName: file.originalname,
      fileSize: file.size,
      mimetype: file.mimetype,
      folder: folder,
      hasBuffer: !!file.buffer
    });

    const timestamp = Date.now();
    const fileExtension = file.originalname.split(".").pop();
    const filename = `assignment_${timestamp}_${Math.random().toString(36).substring(7)}.${fileExtension}`;

    const result = await Imagekit.upload({
      file: file.buffer,
      fileName: filename,
      folder: folder,
      isBase64: false
    });

    console.log("✅ PDF uploaded to ImageKit:", {
      url: result.url,
      fileId: result.fileId,
      fileName: filename
    });

    return {
      success: true,
      url: result.url,
      fileId: result.fileId,
      fileName: filename,
      fileType: file.mimetype,
      originalName: file.originalname,
      fileSize: file.size || 0,
    };
  } catch (error) {
    console.error("❌ Error uploading PDF:", error);
    return {
      success: false,
      message: error.message || 'Failed to upload PDF to ImageKit'
    };
  }
};
