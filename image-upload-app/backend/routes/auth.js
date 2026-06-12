const express = require('express');
const User = require('../models/User');
const { generateToken, authenticateToken, requireAdmin } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { validate } = require('../middleware/validate');
const {
  signupBody,
  loginBody,
  changePasswordBody,
  userIdParams,
  updateRoleBody,
} = require('../validation/schemas');

const router = express.Router();

// Signup route
router.post('/signup',
  authLimiter,
  validate({ body: signupBody }),
  async (req, res) => {
    try {
      const { username, email, password } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ $or: [{ email }, { username }] });
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Create new user
      const user = new User({
        username,
        email,
        password,
        role: 'user' // First user could be made admin manually in DB
      });

      await user.save();

      // Generate token
      const token = generateToken(user._id);

      // Set cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.status(201).json({
        message: 'User created successfully',
        user,
        token
      });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// Login route
router.post('/login',
  authLimiter,
  validate({ body: loginBody }),
  async (req, res) => {
    try {
      const { email, password } = req.body;

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate token
      const token = generateToken(user._id);

      // Set cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.json({
        message: 'Login successful',
        user,
        token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Logout route
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Change password
router.post('/change-password',
  authLimiter,
  authenticateToken,
  validate({ body: changePasswordBody }),
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      // Verify current password
      const isMatch = await req.user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Update password
      req.user.password = newPassword;
      await req.user.save();

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      console.error('Password change error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  }
);

// Get all users (admin only)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Update user role (admin only)
router.patch('/users/:userId/role',
  authenticateToken,
  requireAdmin,
  validate({ params: userIdParams, body: updateRoleBody }),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      // Prevent admin from demoting themselves
      if (userId === req.user._id.toString()) {
        return res.status(400).json({ error: 'Cannot change your own role' });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { role },
        { new: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ message: 'User role updated successfully', user });
    } catch (error) {
      console.error('Update role error:', error);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  }
);

// Delete user (admin only)
router.delete('/users/:userId', authenticateToken, requireAdmin, validate({ params: userIdParams }), async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent admin from deleting themselves
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
