import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import wsService from '../services/websocket';
import MonitoringDashboard from '../components/MonitoringDashboard';

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [metrics, setMetrics] = useState({ cpu: null, memory: null, history: [] });
  const [taskMetrics, setTaskMetrics] = useState(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [taskKeyword, setTaskKeyword] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', assignee_id: '' });
  const [createError, setCreateError] = useState('');

  const fetchPendingRequests = async () => {
    try {
      const res = await api.get('/approvals/pending');
      setPendingRequests(res.data.requests);
    } catch (err) {
      console.error('Failed to fetch pending requests:', err);
    }
  };

  const fetchMembers = useCallback(async () => {
    try {
      const params = {};
      if (memberSearch) params.name = memberSearch;
      const res = await api.get('/admin/members', { params });
      setMembers(res.data.members);
    } catch (err) {
      console.error('Failed to fetch members:', err);
    }
  }, [memberSearch]);

  const fetchTasks = useCallback(async () => {
    try {
      const params = {};
      if (taskKeyword) params.keyword = taskKeyword;
      if (taskAssignee) params.assignee = taskAssignee;
      const res = await api.get('/tasks', { params });
      setTasks(res.data.tasks);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  }, [taskKeyword, taskAssignee]);

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
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    fetchPendingRequests();
    fetchMetrics();
    const metricsInterval = setInterval(fetchMetrics, 30000);

    const handleNewRequest = () => fetchPendingRequests();
    const handleTaskCreated = () => { fetchTasks(); fetchPendingRequests(); fetchMetrics(); };
    const handleTaskDeleted = () => { fetchTasks(); fetchPendingRequests(); fetchMetrics(); };
    const handleTaskStatusUpdated = () => { fetchTasks(); fetchMetrics(); };
    const handleMemberRemoved = () => fetchMembers();

    wsService.on('NEW_APPROVAL_REQUEST', handleNewRequest);
    wsService.on('TASK_CREATED', handleTaskCreated);
    wsService.on('TASK_DELETED', handleTaskDeleted);
    wsService.on('TASK_STATUS_UPDATED', handleTaskStatusUpdated);
    wsService.on('MEMBER_REMOVED', handleMemberRemoved);

    return () => {
      clearInterval(metricsInterval);
      wsService.off('NEW_APPROVAL_REQUEST', handleNewRequest);
      wsService.off('TASK_CREATED', handleTaskCreated);
      wsService.off('TASK_DELETED', handleTaskDeleted);
      wsService.off('TASK_STATUS_UPDATED', handleTaskStatusUpdated);
      wsService.off('MEMBER_REMOVED', handleMemberRemoved);
    };
  }, [fetchMembers, fetchTasks]);

  const handleApprove = async (requestId) => {
    try {
      await api.post(`/approvals/${requestId}/approve`);
      fetchPendingRequests();
      fetchTasks();
      fetchMetrics();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve request.');
    }
  };

  const handleReject = async (requestId) => {
    try {
      await api.post(`/approvals/${requestId}/reject`);
      fetchPendingRequests();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reject request.');
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Are you sure you want to remove this member?')) return;
    try {
      await api.delete(`/admin/members/${memberId}`);
      fetchMembers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove member.');
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!newTask.title.trim()) {
      setCreateError('Task title is required.');
      return;
    }
    try {
      await api.post('/tasks', {
        title: newTask.title.trim(),
        description: newTask.description.trim(),
        assignee_id: newTask.assignee_id || null,
      });
      setNewTask({ title: '', description: '', assignee_id: '' });
      setShowCreateModal(false);
      fetchTasks();
      fetchMetrics();
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create task.');
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
      fetchTasks();
      fetchMetrics();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update task status.');
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      fetchTasks();
      fetchMetrics();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete task.');
    }
  };

  return (
    <div>
      <nav className="navbar">
        <h1>Task Manager - Admin</h1>
        <div className="navbar-right">
          <span className="navbar-user">{user?.username} (Admin)</span>
          <button className="btn-logout" onClick={logout}>Log Out</button>
        </div>
      </nav>

      <div className="dashboard">
        <div className="dashboard-header">
          <h2>Admin Dashboard</h2>
          <p>Manage approval requests, team members, and live operational metrics.</p>
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

        <div className="section-card">
          <h3>Pending Approval Requests</h3>
          {pendingRequests.length === 0 ? (
            <div className="empty-state">No pending requests</div>
          ) : (
            <div className="approval-list">
              {pendingRequests.map((req) => (
                <div key={req.id} className="approval-card">
                  <div className="approval-info">
                    <h4>
                      {req.request_type === 'create' ? 'Create Task' : 'Delete Task'}:{' '}
                      {req.request_type === 'create' ? req.task_title : req.existing_task_title}
                    </h4>
                    <p>
                      Requested by: <strong>{req.requested_by_name}</strong> |{' '}
                      Type: <strong>{req.request_type}</strong> |{' '}
                      {new Date(req.created_at).toLocaleString()}
                    </p>
                    {req.request_type === 'create' && req.task_description && (
                      <p>Description: {req.task_description}</p>
                    )}
                  </div>
                  <div className="approval-actions">
                    <button className="btn-approve" onClick={() => handleApprove(req.id)}>
                      Approve
                    </button>
                    <button className="btn-reject" onClick={() => handleReject(req.id)}>
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3>All Tasks</h3>
            <button className="btn-approve" onClick={() => setShowCreateModal(true)}>+ New Task</button>
          </div>
          <form className="search-bar" onSubmit={(e) => { e.preventDefault(); fetchTasks(); }}>
            <input
              type="text"
              placeholder="Search by keyword..."
              value={taskKeyword}
              onChange={(e) => setTaskKeyword(e.target.value)}
            />
            <input
              type="text"
              placeholder="Search by assignee..."
              value={taskAssignee}
              onChange={(e) => setTaskAssignee(e.target.value)}
            />
            <button type="submit" className="btn-search">Search</button>
          </form>

          <div className="task-columns">
            {['todo', 'in-progress', 'done'].map((status) => (
              <div key={status} className={`task-column ${status}`}>
                <h3>{status === 'todo' ? 'To Do' : status === 'in-progress' ? 'In Progress' : 'Done'} ({tasks.filter((t) => t.status === status).length})</h3>
                {tasks.filter((t) => t.status === status).map((task) => (
                  <div key={task.id} className="task-card">
                    <div className="task-title">{task.title}</div>
                    {task.description && <div className="task-desc">{task.description}</div>}
                    <div className="task-assignee">Assigned to: {task.assignee_name || 'Unassigned'}</div>
                    <div className="task-actions" style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {status !== 'todo' && (
                        <button className="btn-status" onClick={() => handleStatusChange(task.id, 'todo')}>→ To Do</button>
                      )}
                      {status !== 'in-progress' && (
                        <button className="btn-status" onClick={() => handleStatusChange(task.id, 'in-progress')}>→ In Progress</button>
                      )}
                      {status !== 'done' && (
                        <button className="btn-status" onClick={() => handleStatusChange(task.id, 'done')}>→ Done</button>
                      )}
                      <button className="btn-remove" onClick={() => handleDeleteTask(task.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Create New Task</h3>
              {createError && <div className="error-message">{createError}</div>}
              <form onSubmit={handleCreateTask}>
                <div className="form-group">
                  <label>Title *</label>
                  <input
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    placeholder="Task title"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    placeholder="Task description (optional)"
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>Assign To</label>
                  <select
                    value={newTask.assignee_id || ''}
                    onChange={(e) => setNewTask({ ...newTask, assignee_id: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.username}</option>
                    ))}
                  </select>
                </div>
                <div className="modal-actions">
                  <button type="submit" className="btn-approve">Create Task</button>
                  <button type="button" className="btn-reject" onClick={() => setShowCreateModal(false)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="section-card members-section">
          <h3>Team Members</h3>
          <form className="search-bar" onSubmit={(e) => { e.preventDefault(); fetchMembers(); }}>
            <input
              type="text"
              placeholder="Search members by name..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />
            <button type="submit" className="btn-search">Search</button>
          </form>
          {members.length === 0 ? (
            <div className="empty-state">No members found</div>
          ) : (
            members.map((member) => (
              <div key={member.id} className="member-row">
                <div className="member-info">
                  <strong>{member.username}</strong>
                  <span className="member-email"> - {member.email}</span>
                </div>
                <button className="btn-remove" onClick={() => handleRemoveMember(member.id)}>
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
