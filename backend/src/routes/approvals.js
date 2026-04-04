const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/approvals/request-create - Member requests task creation
router.post('/request-create', authenticateToken, async (req, res) => {
  try {
    const { title, description, assignee_id } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Task title is required.' });
    }

    const result = await pool.query(
      `INSERT INTO approval_requests (request_type, task_title, task_description, task_assignee_id, requested_by)
       VALUES ('create', $1, $2, $3, $4)
       RETURNING *`,
      [title, description || '', assignee_id || req.user.id, req.user.id]
    );

    // Broadcast to admin via WebSocket
    if (req.app.locals.broadcast) {
      req.app.locals.broadcast({
        type: 'NEW_APPROVAL_REQUEST',
        payload: result.rows[0],
      });
    }

    res.status(201).json({ message: 'Task creation request submitted for approval.', request: result.rows[0] });
  } catch (err) {
    console.error('Request create error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/approvals/request-delete/:taskId - Member requests task deletion
router.post('/request-delete/:taskId', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.taskId;

    // Check task exists
    const taskCheck = await pool.query('SELECT id FROM tasks WHERE id = $1', [taskId]);
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    // Check if there's already a pending delete request for this task
    const existingRequest = await pool.query(
      "SELECT id FROM approval_requests WHERE task_id = $1 AND request_type = 'delete' AND status = 'pending'",
      [taskId]
    );
    if (existingRequest.rows.length > 0) {
      return res.status(409).json({ error: 'A deletion request for this task is already pending.' });
    }

    const result = await pool.query(
      `INSERT INTO approval_requests (request_type, task_id, requested_by)
       VALUES ('delete', $1, $2)
       RETURNING *`,
      [taskId, req.user.id]
    );

    if (req.app.locals.broadcast) {
      req.app.locals.broadcast({
        type: 'NEW_APPROVAL_REQUEST',
        payload: result.rows[0],
      });
    }

    res.status(201).json({ message: 'Task deletion request submitted for approval.', request: result.rows[0] });
  } catch (err) {
    console.error('Request delete error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/approvals/pending - Admin gets all pending approval requests
router.get('/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ar.*, u.username AS requested_by_name,
              t.title AS existing_task_title, t.description AS existing_task_description
       FROM approval_requests ar
       LEFT JOIN users u ON ar.requested_by = u.id
       LEFT JOIN tasks t ON ar.task_id = t.id
       WHERE ar.status = 'pending'
       ORDER BY ar.created_at DESC`
    );

    res.json({ requests: result.rows });
  } catch (err) {
    console.error('Get pending approvals error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/approvals/:id/approve - Admin approves a request
router.post('/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get the request
    const reqResult = await client.query(
      'SELECT * FROM approval_requests WHERE id = $1 AND status = $2',
      [req.params.id, 'pending']
    );

    if (reqResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending request not found.' });
    }

    const approvalReq = reqResult.rows[0];

    if (approvalReq.request_type === 'create') {
      // Create the task
      const taskResult = await client.query(
        `INSERT INTO tasks (title, description, assignee_id, created_by)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [approvalReq.task_title, approvalReq.task_description, approvalReq.task_assignee_id, approvalReq.requested_by]
      );

      // Update approval request
      await client.query(
        "UPDATE approval_requests SET status = 'approved', reviewed_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [req.user.id, req.params.id]
      );

      await client.query('COMMIT');

      if (req.app.locals.broadcast) {
        req.app.locals.broadcast({
          type: 'TASK_CREATED',
          payload: taskResult.rows[0],
        });
      }

      res.json({ message: 'Task creation approved.', task: taskResult.rows[0] });
    } else if (approvalReq.request_type === 'delete') {
      // Delete the task
      await client.query('DELETE FROM tasks WHERE id = $1', [approvalReq.task_id]);

      // Update approval request
      await client.query(
        "UPDATE approval_requests SET status = 'approved', reviewed_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [req.user.id, req.params.id]
      );

      await client.query('COMMIT');

      if (req.app.locals.broadcast) {
        req.app.locals.broadcast({
          type: 'TASK_DELETED',
          payload: { taskId: approvalReq.task_id },
        });
      }

      res.json({ message: 'Task deletion approved.' });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Approve request error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// POST /api/approvals/:id/reject - Admin rejects a request
router.post('/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE approval_requests SET status = 'rejected', reviewed_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status = 'pending' RETURNING *",
      [req.user.id, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pending request not found.' });
    }

    if (req.app.locals.broadcast) {
      req.app.locals.broadcast({
        type: 'REQUEST_REJECTED',
        payload: result.rows[0],
      });
    }

    res.json({ message: 'Request rejected.', request: result.rows[0] });
  } catch (err) {
    console.error('Reject request error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
