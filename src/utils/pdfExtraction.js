import { PDFParse } from 'pdf-parse';
import logger from './logger.js';

/**
 * Minimum text length to consider extraction successful
 */
const MIN_TEXT_LENGTH = 50;

/**
 * Extract text from PDF buffer with enhanced error handling
 * @param {Buffer} fileBuffer - PDF file buffer
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} - Extraction result with text and metadata
 */
export const extractTextFromPDF = async (fileBuffer, options = {}) => {
  const { minTextLength = MIN_TEXT_LENGTH, fileName = 'unknown' } = options;
  
  try {
    // Validate buffer
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new Error('Invalid file buffer provided');
    }

    if (fileBuffer.length === 0) {
      throw new Error('File buffer is empty');
    }

    // Check if buffer looks like a PDF (starts with PDF magic bytes)
    const pdfMagicBytes = fileBuffer.slice(0, 4).toString();
    if (pdfMagicBytes !== '%PDF') {
      throw new Error('File does not appear to be a valid PDF (missing PDF header)');
    }

    // Attempt PDF parsing using PDFParse class (v2 API)
    let parser;
    let pdfData;
    try {
      // Create parser instance with buffer data
      parser = new PDFParse({ data: fileBuffer });
      
      // Get text from PDF
      pdfData = await parser.getText();
      
      // Clean up parser resources
      await parser.destroy();
    } catch (parseError) {
      // Clean up parser if it was created
      if (parser) {
        try {
          await parser.destroy();
        } catch (destroyError) {
          // Ignore destroy errors
        }
      }
      
      // Provide more specific error messages based on error type
      if (parseError.message?.includes('encrypted') || parseError.message?.includes('password')) {
        throw new Error('PDF is encrypted or password-protected. Please provide an unencrypted PDF.');
      }
      if (parseError.message?.includes('corrupt') || parseError.message?.includes('invalid')) {
        throw new Error('PDF file appears to be corrupted or invalid. Please verify the file integrity.');
      }
      throw new Error(`PDF parsing failed: ${parseError.message || 'Unknown error'}`);
    }

    // Extract text - PDFParse.getText() returns { text, ... }
    const extractedText = pdfData?.text || '';

    // Validate extracted text
    const validationResult = validateExtractedText(extractedText, minTextLength);

    if (!validationResult.isValid) {
      throw new Error(validationResult.error || 'Text extraction validation failed');
    }

    // Return result with metadata
    return {
      success: true,
      text: extractedText.trim(),
      metadata: {
        numPages: pdfData.total || pdfData.pages?.length || 0,
        info: pdfData.info || {},
        textLength: extractedText.length,
        fileName,
        extractedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error(`PDF extraction error for ${fileName}:`, error);
    
    return {
      success: false,
      text: '',
      error: error.message || 'Unknown extraction error',
      metadata: {
        fileName,
        extractedAt: new Date().toISOString(),
      },
    };
  }
};

/**
 * Validate extracted text quality
 * @param {string} text - Extracted text
 * @param {number} minLength - Minimum required length
 * @returns {Object} - Validation result
 */
export const validateExtractedText = (text, minLength = MIN_TEXT_LENGTH) => {
  if (!text || typeof text !== 'string') {
    return {
      isValid: false,
      error: 'Extracted text is not a valid string',
    };
  }

  const trimmedText = text.trim();

  if (trimmedText.length === 0) {
    return {
      isValid: false,
      error: 'No text could be extracted from the PDF. The PDF may be image-based (scanned) or contain no text layer.',
      suggestion: 'Please ensure the PDF contains selectable text. Scanned PDFs require OCR processing.',
    };
  }

  if (trimmedText.length < minLength) {
    return {
      isValid: false,
      error: `Extracted text is too short (${trimmedText.length} characters, minimum ${minLength} required). The PDF may be mostly images or have limited text content.`,
      suggestion: 'Please verify the PDF contains sufficient text content.',
    };
  }

  // Check if text is mostly whitespace or special characters
  const nonWhitespaceChars = trimmedText.replace(/\s/g, '').length;
  const whitespaceRatio = (trimmedText.length - nonWhitespaceChars) / trimmedText.length;
  
  if (whitespaceRatio > 0.8) {
    return {
      isValid: false,
      error: 'Extracted text contains too much whitespace. The PDF may be improperly formatted.',
      suggestion: 'Please check the PDF formatting.',
    };
  }

  return {
    isValid: true,
    textLength: trimmedText.length,
    nonWhitespaceChars,
  };
};

/**
 * Get extraction diagnostics for debugging
 * @param {Buffer} fileBuffer - PDF file buffer
 * @param {string} fileName - File name
 * @returns {Object} - Diagnostic information
 */
export const getExtractionDiagnostics = (fileBuffer, fileName = 'unknown') => {
  const diagnostics = {
    fileName,
    bufferSize: fileBuffer?.length || 0,
    isValidBuffer: Buffer.isBuffer(fileBuffer),
    hasPDFHeader: false,
    timestamp: new Date().toISOString(),
  };

  if (fileBuffer && Buffer.isBuffer(fileBuffer)) {
    const header = fileBuffer.slice(0, 4).toString();
    diagnostics.hasPDFHeader = header === '%PDF';
    
    if (fileBuffer.length > 8) {
      const version = fileBuffer.slice(4, 8).toString();
      diagnostics.pdfVersion = version;
    }
  }

  return diagnostics;
};

