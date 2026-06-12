const { z } = require('zod');

// Shared building blocks ----------------------------------------------------

// A Mongo ObjectId is a 24-character hex string. Validating against this regex
// means a field that later feeds a Mongoose query or `permissions.push({ user })`
// cannot be an operator object such as `{ "$gt": "" }`.
const objectId = z
  .string({ invalid_type_error: 'Invalid id' })
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid id');

// A required, trimmed string. Any non-string input (object/array/number) is
// rejected by Zod before reaching the route handler.
const trimmedString = z.string().trim();

// ---- Auth schemas ---------------------------------------------------------

const signupBody = z
  .object({
    username: trimmedString
      .min(3, 'Username must be 3-30 characters')
      .max(30, 'Username must be 3-30 characters'),
    email: trimmedString.toLowerCase().email('Invalid email'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  })
  .strict();

const loginBody = z
  .object({
    email: trimmedString.toLowerCase().email('Invalid email'),
    password: z.string().min(1, 'Password required'),
  })
  .strict();

const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1, 'Current password required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  })
  .strict();

const userIdParams = z.object({ userId: objectId });

const updateRoleBody = z
  .object({
    role: z.enum(['admin', 'user'], {
      errorMap: () => ({ message: 'Role must be either admin or user' }),
    }),
  })
  .strict();

// ---- Folder schemas -------------------------------------------------------

const folderIdParams = z.object({ folderId: objectId });

const folderPermissionParams = z.object({
  folderId: objectId,
  userId: objectId,
});

const createFolderBody = z
  .object({
    name: trimmedString.min(1, 'Folder name required'),
    isPublic: z.boolean().optional(),
    displayOnPublicGallery: z.boolean().optional(),
    password: z.string().optional(),
  })
  .strict();

const updateFolderBody = z
  .object({
    name: trimmedString.min(1, 'Folder name cannot be empty').optional(),
    isPublic: z.boolean().optional(),
    displayOnPublicGallery: z.boolean().optional(),
    password: z.string().optional(),
    removePassword: z.boolean().optional(),
  })
  .strict();

const addPermissionBody = z
  .object({
    userId: objectId,
    access: z.enum(['read', 'write', 'admin'], {
      errorMap: () => ({ message: 'Invalid access level' }),
    }),
  })
  .strict();

// Public folder password check. Password is optional because public folders
// may have no password set; when present it must be a string (never an object).
const verifyFolderPasswordBody = z
  .object({
    password: z.string().optional(),
  })
  .strict();

module.exports = {
  objectId,
  // auth
  signupBody,
  loginBody,
  changePasswordBody,
  userIdParams,
  updateRoleBody,
  // folders
  folderIdParams,
  folderPermissionParams,
  createFolderBody,
  updateFolderBody,
  addPermissionBody,
  verifyFolderPasswordBody,
};
