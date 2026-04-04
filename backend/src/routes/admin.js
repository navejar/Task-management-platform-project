const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/members - Get all members
router.get('/members', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name } = req.query;
    let query = "SELECT id, username, email, role, created_at FROM users WHERE role = 'member'";
    const params = [];

    if (name) {
      params.push(`%${name}%`);
      query += ` AND username ILIKE $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json({ members: result.rows });
  } catch (err) {
    console.error('Get members error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/admin/members/:id - Remove a member
router.delete('/members/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const memberId = req.params.id;

    // Verify the user is a member (not admin)
    const userCheck = await pool.query(
      "SELECT id, role FROM users WHERE id = $1",
      [memberId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (userCheck.rows[0].role === 'admin') {
      return res.status(403).json({ error: 'Cannot delete an admin user.' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [memberId]);

    if (req.app.locals.broadcast) {
      req.app.locals.broadcast({
        type: 'MEMBER_REMOVED',
        payload: { memberId: parseInt(memberId) },
      });
    }

    res.json({ message: 'Member removed successfully.' });
  } catch (err) {
    console.error('Delete member error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
