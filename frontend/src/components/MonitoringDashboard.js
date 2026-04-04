import React from 'react';

const formatTimestamp = (value) => {
  if (!value) return '--';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDateLabel = (value) => {
  return new Date(value).toLocaleDateString([], { weekday: 'short' });
};

const statusLabelMap = { 
  todo: 'To Do',
  'in-progress': 'In Progress',
  done: 'Done',
};

const statusClassMap = {
  todo: 'todo',
  'in-progress': 'inprogress',
  done: 'done',
};

const TinyLineChart = ({ title, data = [], valueKey, lineClass }) => {
  const valid = data.filter((item) => Number.isFinite(item?.[valueKey]));

  if (valid.length === 0) {
    return (
      <div className="monitor-panel chart-panel">
        <div className="panel-header">
          <h4>{title}</h4>
          <span>No samples yet</span>
        </div>
        <div className="chart-empty">Waiting for monitoring samples...</div>
      </div>
    );
  }

  const width = 100;
  const height = 44;
  const maxValue = Math.max(...valid.map((item) => item[valueKey]), 100);
  const points = valid.map((item, index) => {
    const x = valid.length === 1 ? width / 2 : (index / (valid.length - 1)) * width;
    const y = height - (item[valueKey] / maxValue) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="monitor-panel chart-panel">
      <div className="panel-header">
        <h4>{title}</h4>
        <span>Last {valid.length} refreshes</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="line-chart" preserveAspectRatio="none">
        <polyline className={lineClass} fill="none" strokeWidth="3" points={points} />
      </svg>
      <div className="chart-axis-labels">
        <span>{formatTimestamp(valid[0]?.timestamp)}</span>
        <span>{formatTimestamp(valid[valid.length - 1]?.timestamp)}</span>
      </div>
    </div>
  );
};

const DailyActivityChart = ({ data = [] }) => {
  const safeData = data.length ? data : [];
  const maxValue = Math.max(1, ...safeData.flatMap((item) => [item.created, item.completed, item.updated]));

  return (
    <div className="monitor-panel daily-chart-panel">
      <div className="panel-header">
        <h4>Task Activity (7 days)</h4>
        <span>Created, completed, and updated volume</span>
      </div>
      {safeData.length === 0 ? (
        <div className="chart-empty">No task activity yet.</div>
      ) : (
        <div className="daily-bars">
          {safeData.map((item) => (
            <div key={item.day} className="daily-bar-group">
              <div className="daily-bar-stack">
                <div className="daily-bar created" style={{ height: `${(item.created / maxValue) * 100}%` }} title={`Created: ${item.created}`} />
                <div className="daily-bar completed" style={{ height: `${(item.completed / maxValue) * 100}%` }} title={`Completed: ${item.completed}`} />
                <div className="daily-bar updated" style={{ height: `${(item.updated / maxValue) * 100}%` }} title={`Updated: ${item.updated}`} />
              </div>
              <div className="daily-bar-label">{formatDateLabel(item.day)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="chart-legend">
        <span><i className="legend-dot created" />Created</span>
        <span><i className="legend-dot completed" />Completed</span>
        <span><i className="legend-dot updated" />Updated</span>
      </div>
    </div>
  );
};

const MonitoringDashboard = ({ metrics, taskMetrics }) => {
  const cpuPercentage = metrics?.cpu?.percentage ?? 0;
  const memoryPercentage = metrics?.memory?.percentage ?? 0;
  const statusBreakdown = taskMetrics?.statusBreakdown || [];
  const assigneeLoad = taskMetrics?.assigneeLoad || [];
  const recentActivity = taskMetrics?.recentActivity || [];
  const dailyActivity = taskMetrics?.dailyActivity || [];

  return (
    <>
      <div className="metrics-row monitoring-summary-row">
        <div className="metric-card metric-highlight">
          <div className="metric-label">CPU Usage</div>
          <div className="metric-value">{metrics?.cpu?.percentage ?? '--'}%</div>
          <div className="metric-subtext">
            {metrics?.cpu?.cores ? `${metrics.cpu.cores} cores visible` : `Source: ${metrics?.source || '--'}`}
          </div>
          <div className="metric-bar">
            <div className="metric-bar-fill cpu" style={{ width: `${cpuPercentage}%` }} />
          </div>
        </div>
        <div className="metric-card metric-highlight">
          <div className="metric-label">Memory Usage</div>
          <div className="metric-value">{metrics?.memory?.percentage ?? '--'}%</div>
          <div className="metric-subtext">
            {metrics?.memory?.used_mb != null && metrics?.memory?.total_mb != null
              ? `${metrics.memory.used_mb} MB / ${metrics.memory.total_mb} MB`
              : 'Memory data unavailable'}
          </div>
          <div className="metric-bar">
            <div className="metric-bar-fill memory" style={{ width: `${memoryPercentage}%` }} />
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Open Tasks</div>
          <div className="metric-value">{taskMetrics?.open ?? '--'}</div>
          <div className="metric-subtext">Pending work across the board</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Completed Today</div>
          <div className="metric-value">{taskMetrics?.completedToday ?? '--'}</div>
          <div className="metric-subtext">Tasks moved to done today</div>
        </div>
      </div>

      <div className="monitor-grid">
        <TinyLineChart
          title="CPU trend"
          data={metrics?.history}
          valueKey="cpuPercentage"
          lineClass="line-chart-cpu"
        />
        <TinyLineChart
          title="Memory trend"
          data={metrics?.history}
          valueKey="memoryPercentage"
          lineClass="line-chart-memory"
        />
        <div className="monitor-panel status-panel">
          <div className="panel-header">
            <h4>Status Breakdown</h4>
            <span>{taskMetrics?.total ?? 0} total tasks</span>
          </div>
          <div className="status-breakdown-list">
            {statusBreakdown.map((item) => (
              <div key={item.status} className="status-breakdown-row">
                <div className="status-breakdown-top">
                  <span className={`status-pill ${statusClassMap[item.status]}`}>{statusLabelMap[item.status] || item.status}</span>
                  <span>{item.count} ({item.percentage}%)</span>
                </div>
                <div className="metric-bar compact">
                  <div className={`metric-bar-fill ${statusClassMap[item.status]}`} style={{ width: `${item.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="monitor-panel quick-stats-panel">
          <div className="panel-header">
            <h4>Task Velocity</h4>
            <span>Recent delivery snapshot</span>
          </div>
          <div className="quick-stats-grid">
            <div className="quick-stat-box">
              <strong>{taskMetrics?.createdToday ?? 0}</strong>
              <span>Created today</span>
            </div>
            <div className="quick-stat-box">
              <strong>{taskMetrics?.createdLast7Days ?? 0}</strong>
              <span>Created in 7 days</span>
            </div>
            <div className="quick-stat-box">
              <strong>{taskMetrics?.completedToday ?? 0}</strong>
              <span>Completed today</span>
            </div>
            <div className="quick-stat-box">
              <strong>{taskMetrics?.completedLast7Days ?? 0}</strong>
              <span>Completed in 7 days</span>
            </div>
          </div>
        </div>
      </div>

      <div className="monitor-grid two-column">
        <DailyActivityChart data={dailyActivity} />
        <div className="monitor-panel">
          <div className="panel-header">
            <h4>Workload by Assignee</h4>
            <span>Top owners of open tasks</span>
          </div>
          {assigneeLoad.length === 0 ? (
            <div className="chart-empty">No open tasks right now.</div>
          ) : (
            <div className="assignee-load-list">
              {assigneeLoad.map((item) => {
                const maxLoad = Math.max(...assigneeLoad.map((entry) => entry.open_count), 1);
                const width = (item.open_count / maxLoad) * 100;
                return (
                  <div key={item.assignee_name} className="assignee-load-row">
                    <div className="assignee-load-header">
                      <span>{item.assignee_name}</span>
                      <strong>{item.open_count}</strong>
                    </div>
                    <div className="metric-bar compact">
                      <div className="metric-bar-fill cpu" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="monitor-panel recent-activity-panel">
        <div className="panel-header">
          <h4>Recent Task Activity</h4>
          <span>
            Updated {metrics?.timestamp ? new Date(metrics.timestamp).toLocaleString() : '--'}
            {metrics?.source ? ` · Source: ${metrics.source}` : ''}
          </span>
        </div>
        {recentActivity.length === 0 ? (
          <div className="chart-empty">No recent task activity available.</div>
        ) : (
          <div className="activity-feed">
            {recentActivity.map((item) => (
              <div key={item.id} className="activity-feed-item">
                <div>
                  <div className="activity-title">{item.title}</div>
                  <div className="activity-meta">
                    Assigned to {item.assignee_name || 'Unassigned'} · Created by {item.created_by_name || 'Unknown'}
                  </div>
                </div>
                <div className="activity-side">
                  <span className={`status-pill ${statusClassMap[item.status]}`}>{statusLabelMap[item.status] || item.status}</span>
                  <small>{new Date(item.updated_at).toLocaleString()}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default MonitoringDashboard;
