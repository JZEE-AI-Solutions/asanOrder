const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class ImageStorageService {
  constructor() {
    this.storageMode = process.env.IMAGE_STORAGE_MODE || 'database'; // 'database' or 'filesystem'
  }

  /**
   * Store image data in database or filesystem
   * @param {Buffer} imageBuffer - Image data as buffer
   * @param {string} mimeType - MIME type of the image
   * @param {string} entityType - Type of entity (product, invoice, return, order)
   * @param {string} entityId - ID of the entity
   * @returns {Object} Storage result
   */
  async storeImage(imageBuffer, mimeType, entityType, entityId) {
    if (this.storageMode === 'database') {
      return this.storeInDatabase(imageBuffer, mimeType, entityType, entityId);
    } else {
      return this.storeInFilesystem(imageBuffer, mimeType, entityType, entityId);
    }
  }

  /**
   * Store image in database as BLOB
   */
  async storeInDatabase(imageBuffer, mimeType, entityType, entityId) {
    try {
      const imageData = {
        imageData: imageBuffer,
        imageType: mimeType,
        updatedAt: new Date()
      };

      // Update the appropriate entity with image data
      const prisma = require('../lib/db');
      
      switch (entityType) {
        case 'product':
          await prisma.product.update({
            where: { id: entityId },
            data: imageData
          });
          break;
        case 'invoice':
          await prisma.purchaseInvoice.update({
            where: { id: entityId },
            data: imageData
          });
          break;
        case 'return':
          await prisma.return.update({
            where: { id: entityId },
            data: imageData
          });
          break;
        case 'order':
          await prisma.order.update({
            where: { id: entityId },
            data: imageData
          });
          break;
        case 'purchase-item':
          await prisma.purchaseItem.update({
            where: { id: entityId },
            data: imageData
          });
          break;
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }

      return {
        success: true,
        storageType: 'database',
        entityType,
        entityId,
        mimeType,
        size: imageBuffer.length
      };
    } catch (error) {
      console.error('Error storing image in database:', error);
      throw error;
    }
  }

  /**
   * Store image in filesystem (legacy method)
   */
  async storeInFilesystem(imageBuffer, mimeType, entityType, entityId) {
    try {
      const uploadsDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const fileExtension = this.getFileExtension(mimeType);
      const fileName = `${entityType}_${entityId}_${uuidv4()}.${fileExtension}`;
      const filePath = path.join(uploadsDir, fileName);

      fs.writeFileSync(filePath, imageBuffer);

      return {
        success: true,
        storageType: 'filesystem',
        filePath: `/uploads/${fileName}`,
        entityType,
        entityId,
        mimeType,
        size: imageBuffer.length
      };
    } catch (error) {
      console.error('Error storing image in filesystem:', error);
      throw error;
    }
  }

  /**
   * Retrieve image data from database or filesystem
   * @param {string} entityType - Type of entity
   * @param {string} entityId - ID of the entity
   * @returns {Object} Image data
   */
  async getImage(entityType, entityId) {
    if (this.storageMode === 'database') {
      return this.getFromDatabase(entityType, entityId);
    } else {
      return this.getFromFilesystem(entityType, entityId);
    }
  }

  /**
   * Get image from database
   */
  async getFromDatabase(entityType, entityId) {
    try {
      const prisma = require('../lib/db');
      let entity;

      switch (entityType) {
        case 'product':
          entity = await prisma.product.findUnique({
            where: { id: entityId },
            select: { imageData: true, imageType: true, updatedAt: true }
          });
          break;
        case 'invoice':
          entity = await prisma.purchaseInvoice.findUnique({
            where: { id: entityId },
            select: { imageData: true, imageType: true, updatedAt: true }
          });
          break;
        case 'return':
          entity = await prisma.return.findUnique({
            where: { id: entityId },
            select: { imageData: true, imageType: true, updatedAt: true }
          });
          break;
        case 'order':
          entity = await prisma.order.findUnique({
            where: { id: entityId },
            select: { imagesData: true, imagesType: true, updatedAt: true }
          });
          break;
        case 'purchase-item':
          entity = await prisma.purchaseItem.findUnique({
            where: { id: entityId },
            select: { imageData: true, imageType: true, updatedAt: true }
          });
          break;
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }

      if (!entity || !entity.imageData) {
        return null;
      }

      return {
        data: entity.imageData,
        mimeType: entity.imageType,
        size: entity.imageData.length,
        updatedAt: entity.updatedAt
      };
    } catch (error) {
      console.error('Error retrieving image from database:', error);
      throw error;
    }
  }

  /**
   * Get image from filesystem
   */
  async getFromFilesystem(entityType, entityId) {
    try {
      const uploadsDir = path.join(__dirname, '../uploads');
      const files = fs.readdirSync(uploadsDir);
      const matchingFile = files.find(file => 
        file.startsWith(`${entityType}_${entityId}_`)
      );

      if (!matchingFile) {
        return null;
      }

      const filePath = path.join(uploadsDir, matchingFile);
      const imageBuffer = fs.readFileSync(filePath);
      const mimeType = this.getMimeTypeFromExtension(path.extname(matchingFile));

      return {
        data: imageBuffer,
        mimeType,
        size: imageBuffer.length
      };
    } catch (error) {
      console.error('Error retrieving image from filesystem:', error);
      throw error;
    }
  }

  /**
   * Delete image from database or filesystem
   */
  async deleteImage(entityType, entityId) {
    if (this.storageMode === 'database') {
      return this.deleteFromDatabase(entityType, entityId);
    } else {
      return this.deleteFromFilesystem(entityType, entityId);
    }
  }

  /**
   * Delete image from database
   */
  async deleteFromDatabase(entityType, entityId) {
    try {
      const prisma = require('../lib/db');
      const imageData = {
        imageData: null,
        imageType: null,
        updatedAt: new Date()
      };

      switch (entityType) {
        case 'product':
          await prisma.product.update({
            where: { id: entityId },
            data: imageData
          });
          break;
        case 'invoice':
          await prisma.purchaseInvoice.update({
            where: { id: entityId },
            data: imageData
          });
          break;
        case 'return':
          await prisma.return.update({
            where: { id: entityId },
            data: imageData
          });
          break;
        case 'order':
          await prisma.order.update({
            where: { id: entityId },
            data: imageData
          });
          break;
        case 'purchase-item':
          await prisma.purchaseItem.update({
            where: { id: entityId },
            data: imageData
          });
          break;
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting image from database:', error);
      throw error;
    }
  }

  /**
   * Delete image from filesystem
   */
  async deleteFromFilesystem(entityType, entityId) {
    try {
      const uploadsDir = path.join(__dirname, '../uploads');
      const files = fs.readdirSync(uploadsDir);
      const matchingFile = files.find(file => 
        file.startsWith(`${entityType}_${entityId}_`)
      );

      if (matchingFile) {
        const filePath = path.join(uploadsDir, matchingFile);
        fs.unlinkSync(filePath);
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting image from filesystem:', error);
      throw error;
    }
  }

  /**
   * Get file extension from MIME type
   */
  getFileExtension(mimeType) {
    const extensions = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg'
    };
    return extensions[mimeType] || 'jpg';
  }

  /**
   * Get MIME type from file extension
   */
  getMimeTypeFromExtension(extension) {
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    };
    return mimeTypes[extension.toLowerCase()] || 'image/jpeg';
  }

  /**
   * Convert file buffer to base64 for API responses
   */
  bufferToBase64(buffer) {
    return buffer.toString('base64');
  }

  /**
   * Convert base64 to buffer for storage
   */
  base64ToBuffer(base64String) {
    return Buffer.from(base64String, 'base64');
  }
}

module.exports = new ImageStorageService();
