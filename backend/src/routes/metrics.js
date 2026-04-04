const express = require('express');
const axios = require('axios');
const os = require('os');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

const DO_API_TOKEN = process.env.DO_API_TOKEN;
const DO_DROPLET_ID = process.env.DO_DROPLET_ID;
const SYSTEM_HISTORY_LIMIT = 20;
const systemHistory = [];

const clampPercentage = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Number(value.toFixed(1))));
};

const recordSystemSample = (sample) => {
  systemHistory.push(sample);
  if (systemHistory.length > SYSTEM_HISTORY_LIMIT) {
    systemHistory.splice(0, systemHistory.length - SYSTEM_HISTORY_LIMIT);
  }
};

// Helper: measure actual CPU usage over a short interval
const getCpuUsage = () => {
  return new Promise((resolve) => {
    const cpus1 = os.cpus();
    setTimeout(() => {
      const cpus2 = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;
      for (let i = 0; i < cpus2.length; i++) {
        const c1 = cpus1[i].times;
        const c2 = cpus2[i].times;
        const idle = c2.idle - c1.idle;
        const total =
          (c2.user - c1.user) +
          (c2.nice - c1.nice) +
          (c2.sys - c1.sys) +
          (c2.irq - c1.irq) +
          (c2.idle - c1.idle);
        totalIdle += idle;
        totalTick += total;
      }
      const cpuPercentage = totalTick > 0 ? ((1 - totalIdle / totalTick) * 100) : 0;
      resolve(parseFloat(cpuPercentage.toFixed(1)));
    }, 250);
  });
};

const getContainerMetrics = async () => {
  const cpuPercentage = clampPercentage(await getCpuUsage());
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercentage = clampPercentage((usedMem / totalMem) * 100);

  return {
    cpu: {
      percentage: cpuPercentage,
      cores: os.cpus().length,
      label: 'CPU Usage',
    },
    memory: {
      percentage: memPercentage,
      used_mb: Math.floor(usedMem / (1024 * 1024)),
      total_mb: Math.floor(totalMem / (1024 * 1024)),
      label: 'Memory Usage',
    },
    source: 'container',
  };
};

const getDigitalOceanMetrics = async () => {
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

  const [cpuResponse, memFreeResponse, memTotalResponse] = await Promise.all([
    axios.get('https://api.digitalocean.com/v2/monitoring/metrics/droplet/cpu', {
      params: {
        host_id: DO_DROPLET_ID,
        start: fiveMinAgo.toISOString(),
        end: now.toISOString(),
      },
      headers: { Authorization: `Bearer ${DO_API_TOKEN}` },
    }),
    axios.get('https://api.digitalocean.com/v2/monitoring/metrics/droplet/memory_free', {
      params: {
        host_id: DO_DROPLET_ID,
        start: fiveMinAgo.toISOString(),
        end: now.toISOString(),
      },
      headers: { Authorization: `Bearer ${DO_API_TOKEN}` },
    }),
    axios.get('https://api.digitalocean.com/v2/monitoring/metrics/droplet/memory_total', {
      params: {
        host_id: DO_DROPLET_ID,
        start: fiveMinAgo.toISOString(),
        end: now.toISOString(),
      },
      headers: { Authorization: `Bearer ${DO_API_TOKEN}` },
    }),
  ]);

  let cpuPercentage = 0;
  if (cpuResponse.data?.data?.result?.length > 0) {
    const latestValues = cpuResponse.data.data.result
      .map((series) => series.values?.[series.values.length - 1]?.[1])
      .map((value) => parseFloat(value))
      .filter((value) => Number.isFinite(value));

    if (latestValues.length > 0) {
      cpuPercentage = latestValues.reduce((sum, value) => sum + value, 0) / latestValues.length;
    }
  }

  let memFree = 0;
  let memTotal = 0;
  const freeSeries = memFreeResponse.data?.data?.result?.[0]?.values || [];
  const totalSeries = memTotalResponse.data?.data?.result?.[0]?.values || [];
  if (freeSeries.length > 0) memFree = parseFloat(freeSeries[freeSeries.length - 1][1]);
  if (totalSeries.length > 0) memTotal = parseFloat(totalSeries[totalSeries.length - 1][1]);

  const memUsed = Math.max(0, memTotal - memFree);
  const memPercentage = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

  return {
    cpu: {
      percentage: clampPercentage(cpuPercentage),
      label: 'CPU Usage',
    },
    memory: {
      percentage: clampPercentage(memPercentage),
      used_mb: Math.floor(memUsed / (1024 * 1024)),
      total_mb: Math.floor(memTotal / (1024 * 1024)),
      label: 'Memory Usage',
    },
    source: 'digitalocean',
  };
};

// GET /api/metrics/system - Get CPU and memory metrics and a recent history window
router.get('/system', authenticateToken, async (req, res) => {
  try {
    const metrics = (!DO_API_TOKEN || !DO_DROPLET_ID)
      ? await getContainerMetrics()
      : await getDigitalOceanMetrics();

    const timestamp = new Date().toISOString();
    recordSystemSample({
      timestamp,
      cpuPercentage: metrics.cpu.percentage,
      memoryPercentage: metrics.memory.percentage,
    });

    res.json({
      ...metrics,
      timestamp,
      history: systemHistory,
    });
  } catch (err) {
    console.error('Metrics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch system metrics.' });
  }
});

// GET /api/metrics/tasks - Get task activity metrics
router.get('/tasks', authenticateToken, async (req, res) => {
  try {
    const [
      totalTasks,
      byStatus,
      pendingRequests,
      recentActivity,
      createdToday,
      completedToday,
      createdLast7Days,
      completedLast7Days,
      openTasks,
      dailyActivity,
      assigneeLoad,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM tasks'),
      pool.query('SELECT status, COUNT(*)::int as count FROM tasks GROUP BY status'),
      pool.query("SELECT COUNT(*) FROM approval_requests WHERE status = 'pending'"),
      pool.query(`
        SELECT t.id, t.title, t.status, t.updated_at, t.created_at,
               u.username as assignee_name, c.username as created_by_name
        FROM tasks t
        LEFT JOIN users u ON t.assignee_id = u.id
        LEFT JOIN users c ON t.created_by = c.id
        ORDER BY t.updated_at DESC
        LIMIT 6
      `),
      pool.query(`SELECT COUNT(*) FROM tasks WHERE DATE(created_at) = CURRENT_DATE`),
      pool.query(`SELECT COUNT(*) FROM tasks WHERE status = 'done' AND DATE(updated_at) = CURRENT_DATE`),
      pool.query(`SELECT COUNT(*) FROM tasks WHERE created_at >= NOW() - INTERVAL '7 days'`),
      pool.query(`SELECT COUNT(*) FROM tasks WHERE status = 'done' AND updated_at >= NOW() - INTERVAL '7 days'`),
      pool.query(`SELECT COUNT(*) FROM tasks WHERE status != 'done'`),
      pool.query(`
        WITH days AS (
          SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day')::date AS day
        )
        SELECT
          days.day,
          COALESCE(created.count, 0)::int AS created,
          COALESCE(completed.count, 0)::int AS completed,
          COALESCE(updated.count, 0)::int AS updated
        FROM days
        LEFT JOIN (
          SELECT DATE(created_at) AS day, COUNT(*)
          FROM tasks
          WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
          GROUP BY DATE(created_at)
        ) AS created ON created.day = days.day
        LEFT JOIN (
          SELECT DATE(updated_at) AS day, COUNT(*)
          FROM tasks
          WHERE status = 'done' AND updated_at >= CURRENT_DATE - INTERVAL '6 days'
          GROUP BY DATE(updated_at)
        ) AS completed ON completed.day = days.day
        LEFT JOIN (
          SELECT DATE(updated_at) AS day, COUNT(*)
          FROM tasks
          WHERE updated_at >= CURRENT_DATE - INTERVAL '6 days'
          GROUP BY DATE(updated_at)
        ) AS updated ON updated.day = days.day
        ORDER BY days.day ASC
      `),
      pool.query(`
        SELECT
          COALESCE(u.username, 'Unassigned') AS assignee_name,
          COUNT(*)::int AS open_count
        FROM tasks t
        LEFT JOIN users u ON t.assignee_id = u.id
        WHERE t.status != 'done'
        GROUP BY COALESCE(u.username, 'Unassigned')
        ORDER BY open_count DESC, assignee_name ASC
        LIMIT 5
      `),
    ]);

    const total = parseInt(totalTasks.rows[0].count, 10);
    const pendingApprovals = parseInt(pendingRequests.rows[0].count, 10);
    const openTaskCount = parseInt(openTasks.rows[0].count, 10);

    const statusMap = { todo: 0, 'in-progress': 0, done: 0 };
    byStatus.rows.forEach((row) => {
      statusMap[row.status] = parseInt(row.count, 10);
    });

    const statusBreakdown = Object.entries(statusMap).map(([status, count]) => ({
      status,
      count,
      percentage: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0,
    }));

    res.json({
      total,
      open: openTaskCount,
      byStatus: statusMap,
      statusBreakdown,
      pendingApprovals,
      createdToday: parseInt(createdToday.rows[0].count, 10),
      completedToday: parseInt(completedToday.rows[0].count, 10),
      createdLast7Days: parseInt(createdLast7Days.rows[0].count, 10),
      completedLast7Days: parseInt(completedLast7Days.rows[0].count, 10),
      assigneeLoad: assigneeLoad.rows,
      recentActivity: recentActivity.rows,
      dailyActivity: dailyActivity.rows.map((row) => ({
        day: row.day,
        created: row.created,
        completed: row.completed,
        updated: row.updated,
      })),
    });
  } catch (err) {
    console.error('Task metrics error:', err);
    res.status(500).json({ error: 'Failed to fetch task metrics.' });
  }
});

module.exports = router;
