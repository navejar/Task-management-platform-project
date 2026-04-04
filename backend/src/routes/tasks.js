const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/tasks - Get all tasks (with optional search by keyword or assignee)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { keyword, assignee } = req.query;
    let query = `
      SELECT t.*, u.username AS assignee_name, c.username AS created_by_name
      FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      LEFT JOIN users c ON t.created_by = c.id
    `;
    const conditions = [];
    const params = [];

    if (keyword) {
      params.push(`%${keyword}%`);
      conditions.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
    }

    if (assignee) {
      params.push(`%${assignee}%`);
      conditions.push(`u.username ILIKE $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await pool.query(query, params);
    res.json({ tasks: result.rows });
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/tasks/:id - Get a single task
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.username AS assignee_name, c.username AS created_by_name
       FROM tasks t
       LEFT JOIN users u ON t.assignee_id = u.id
       LEFT JOIN users c ON t.created_by = c.id
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    res.json({ task: result.rows[0] });
  } catch (err) {
    console.error('Get task error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PATCH /api/tasks/:id/status - Update task status (admin, creator, or assignee)
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['todo', 'in-progress', 'done'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    // First check the task exists and verify permissions
    const taskCheck = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const task = taskCheck.rows[0];
    const isAdmin = req.user.role === 'admin';
    const isCreator = task.created_by === req.user.id;
    const isAssignee = task.assignee_id === req.user.id;

    if (!isAdmin && !isCreator && !isAssignee) {
      return res.status(403).json({ error: 'You can only update tasks you created or are assigned to.' });
    }

    const result = await pool.query(
      'UPDATE tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );

    if (req.app.locals.broadcast) {
      req.app.locals.broadcast({
        type: 'TASK_STATUS_UPDATED',
        payload: result.rows[0],
      });
    }

    res.json({ message: 'Task status updated.', task: result.rows[0] });
  } catch (err) {
    console.error('Update task status error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/tasks - Admin creates a task directly (no approval needed)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, description, assignee_id } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Task title is required.' });
    }

    const result = await pool.query(
      `INSERT INTO tasks (title, description, assignee_id, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [title, description || '', assignee_id || null, req.user.id]
    );

    if (req.app.locals.broadcast) {
      req.app.locals.broadcast({
        type: 'TASK_CREATED',
        payload: result.rows[0],
      });
    }

    res.status(201).json({ message: 'Task created.', task: result.rows[0] });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/tasks/:id - Admin or task creator can delete directly
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const taskCheck = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const task = taskCheck.rows[0];
    const isAdmin = req.user.role === 'admin';
    const isCreator = task.created_by === req.user.id;

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ error: 'Only admins or the task creator can delete tasks.' });
    }

    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);

    if (req.app.locals.broadcast) {
      req.app.locals.broadcast({
        type: 'TASK_DELETED',
        payload: { taskId: parseInt(req.params.id) },
      });
    }

    res.json({ message: 'Task deleted.' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
