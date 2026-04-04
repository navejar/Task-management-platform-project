import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import wsService from '../services/websocket';
import MonitoringDashboard from '../components/MonitoringDashboard';

const MemberDashboard = () => {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [metrics, setMetrics] = useState({ cpu: null, memory: null, history: [] });
  const [taskMetrics, setTaskMetrics] = useState(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchAssignee, setSearchAssignee] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '' });
  const [error, setError] = useState('');

  const fetchTasks = useCallback(async () => {
    try {
      const params = {};
      if (searchKeyword) params.keyword = searchKeyword;
      if (searchAssignee) params.assignee = searchAssignee;
      const res = await api.get('/tasks', { params });
      setTasks(res.data.tasks);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  }, [searchKeyword, searchAssignee]);

  const fetchMetrics = async () => {
    try {
      const [sysRes, taskRes] = await Promise.all([
        api.get('/metrics/system'),
        api.get('/metrics/tasks'),
      ]);
      setMetrics(sysRes.data);
      setTaskMetrics(taskRes.data);
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    fetchMetrics();
    const metricsInterval = setInterval(fetchMetrics, 30000);

    const handleTaskCreated = () => { fetchTasks(); fetchMetrics(); };
    const handleTaskDeleted = () => { fetchTasks(); fetchMetrics(); };
    const handleTaskStatusUpdated = () => { fetchTasks(); fetchMetrics(); };

    wsService.on('TASK_CREATED', handleTaskCreated);
    wsService.on('TASK_DELETED', handleTaskDeleted);
    wsService.on('TASK_STATUS_UPDATED', handleTaskStatusUpdated);

    return () => {
      clearInterval(metricsInterval);
      wsService.off('TASK_CREATED', handleTaskCreated);
      wsService.off('TASK_DELETED', handleTaskDeleted);
      wsService.off('TASK_STATUS_UPDATED', handleTaskStatusUpdated);
    };
  }, [fetchTasks]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchTasks();
  };

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/approvals/request-create', {
        title: newTask.title,
        description: newTask.description,
      });
      setShowCreateModal(false);
      setNewTask({ title: '', description: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request.');
    }
  };

  const handleDeleteRequest = async (taskId) => {
    try {
      await api.post(`/approvals/request-delete/${taskId}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to request deletion.');
    }
  };

  const handleStatusChange = async (taskId, status) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status });
      fetchTasks();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update status.');
    }
  };

  const todoTasks = tasks.filter((t) => t.status === 'todo');
  const inProgressTasks = tasks.filter((t) => t.status === 'in-progress');
  const doneTasks = tasks.filter((t) => t.status === 'done');

  return (
    <div>
      <nav className="navbar">
        <h1>Task Manager</h1>
        <div className="navbar-right">
          <span className="navbar-user">{user?.username} (Member)</span>
          <button className="btn-logout" onClick={logout}>Log Out</button>
        </div>
      </nav>

      <div className="dashboard">
        <div className="dashboard-header">
          <h2>Member Dashboard</h2>
          <p>Manage tasks and follow live system and team activity trends.</p>
        </div>

        <div className="section-card monitoring-section">
          <div className="section-header-with-copy">
            <div>
              <h3>Monitoring Dashboard</h3>
              <p>CPU, memory, and task activity metrics refresh automatically every 30 seconds and on task events.</p>
            </div>
          </div>
          <MonitoringDashboard metrics={metrics} taskMetrics={taskMetrics} />
        </div>

        <form className="search-bar" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="Search by keyword..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
          <input
            type="text"
            placeholder="Search by assignee..."
            value={searchAssignee}
            onChange={(e) => setSearchAssignee(e.target.value)}
          />
          <button type="submit" className="btn-search">Search</button>
          <button type="button" className="btn-create" onClick={() => setShowCreateModal(true)}>
            + New Task
          </button>
        </form>

        <div className="task-columns">
          <div className="task-column todo">
            <h3>To Do ({todoTasks.length})</h3>
            {todoTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStatusChange={handleStatusChange}
                onDeleteRequest={handleDeleteRequest}
              />
            ))}
            {todoTasks.length === 0 && <div className="empty-state">No tasks</div>}
          </div>

          <div className="task-column in-progress">
            <h3>In Progress ({inProgressTasks.length})</h3>
            {inProgressTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStatusChange={handleStatusChange}
                onDeleteRequest={handleDeleteRequest}
              />
            ))}
            {inProgressTasks.length === 0 && <div className="empty-state">No tasks</div>}
          </div>

          <div className="task-column done">
            <h3>Done ({doneTasks.length})</h3>
            {doneTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStatusChange={handleStatusChange}
                onDeleteRequest={handleDeleteRequest}
              />
            ))}
            {doneTasks.length === 0 && <div className="empty-state">No tasks</div>}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Request New Task</h3>
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleCreateRequest}>
              <div className="form-group">
                <label>Task Title</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="Enter task title"
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Enter task description"
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-create">Submit Request</button>
                <button type="button" className="btn-cancel" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const TaskCard = ({ task, onStatusChange, onDeleteRequest }) => (
  <div className="task-card">
    <div className="task-title">{task.title}</div>
    {task.description && <div className="task-desc">{task.description}</div>}
    <div className="task-assignee">Assigned to: {task.assignee_name || 'Unassigned'}</div>
    <div className="task-actions" style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {task.status !== 'todo' && (
        <button className="btn-status" onClick={() => onStatusChange(task.id, 'todo')}>→ To Do</button>
      )}
      {task.status !== 'in-progress' && (
        <button className="btn-status" onClick={() => onStatusChange(task.id, 'in-progress')}>→ In Progress</button>
      )}
      {task.status !== 'done' && (
        <button className="btn-status" onClick={() => onStatusChange(task.id, 'done')}>→ Done</button>
      )}
      <button className="btn-remove" onClick={() => onDeleteRequest(task.id)}>Request Delete</button>
    </div>
  </div>
);

export default MemberDashboard;
