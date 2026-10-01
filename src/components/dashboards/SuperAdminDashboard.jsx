import React, { useState } from 'react';
import { Shield, Server, Activity, Database, KeyRound, AlertTriangle, CheckCircle, RefreshCw, Download, UserCheck, HardDrive, Cpu, Terminal } from 'lucide-react';

export function SuperAdminDashboard({ go, notify, users = [] }) {
  const [backedUp, setBackedUp] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const auditLogs = [
    { id: 'AUD-901', time: '10:42 AM', user: 'Devendra Singhania (Super Admin)', action: 'Exported encrypted system audit logs', ip: '103.21.244.18', level: 'INFO' },
    { id: 'AUD-900', time: '09:15 AM', user: 'Neha Desai (Accounts)', action: 'Reconciled NEFT payment ₹14,72,000 for Plot A-012', ip: '49.36.120.44', level: 'SUCCESS' },
    { id: 'AUD-899', time: '08:50 AM', user: 'Sanjay Patel (Sales Agent)', action: 'Submitted booking form for client Deepak Iyer', ip: '115.114.88.2', level: 'INFO' },
    { id: 'AUD-898', time: 'Yesterday', user: 'Arjun Shah (Admin)', action: 'Modified plot master price layout B (Silver Oaks)', ip: '157.34.19.89', level: 'WARN' },
    { id: 'AUD-897', time: 'Yesterday', user: 'System Worker', action: 'Daily database automated snapshot backup completed', ip: '10.0.4.12', level: 'SYSTEM' }
  ];

  const handleBackup = () => {
    setBackedUp(true);
    notify('Snapshot created: Database backup archived to secure AWS S3 cold vault.');
  };

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      notify('All microservices and database read-replicas synchronized.');
    }, 900);
  };

  return (
    <div className="role-dashboard super-admin-dash">
      <div className="role-welcome super-welcome">
        <div>
          <span className="eyebrow"><i className="live-dot" /> SYSTEM GOVERNANCE & CLUSTER STATUS</span>
          <h2>Platform Root Command Center</h2>
          <p>Global infrastructure health, encrypted audit logs, tenant configurations, and security authorization.</p>
        </div>
        <div className="welcome-actions">
          <button className="button button-white" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={13} className={syncing ? 'spin-icon' : ''} /> {syncing ? 'Syncing...' : 'Cluster Resync'}
          </button>
          <button className="button button-primary" onClick={handleBackup}>
            <Database size={13} /> {backedUp ? 'Backup Archived ✓' : 'Snapshot Backup'}
          </button>
        </div>
      </div>

      {/* Cluster Health KPI Bar */}
      <div className="mini-stats four">
        <div className="mini-stat">
          <small>PLATFORM AVAILABILITY</small>
          <b className="green-text">99.98%</b>
          <span className="stat-sub">Zero outage this month</span>
        </div>
        <div className="mini-stat">
          <small>API P99 LATENCY</small>
          <b className="green-text">18 ms</b>
          <span className="stat-sub">4 active nodes healthy</span>
        </div>
        <div className="mini-stat">
          <small>IAM ACCOUNTS</small>
          <b>{users.length || 6} Provisioned</b>
          <span className="stat-sub">6 Role tiers active</span>
        </div>
        <div className="mini-stat">
          <small>DATABASE INTEGRITY</small>
          <b className="indigo-text">Optimal</b>
          <span className="stat-sub">PostgreSQL 16 · Replicated</span>
        </div>
      </div>

      {/* Infrastructure & Security Overview */}
      <div className="role-dash-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Live Infrastructure Monitor</h2>
              <p>Real-time telemetry from application containers and database shards</p>
            </div>
            <span className="badge-pill green"><Activity size={12} /> All Nodes Operational</span>
          </div>

          <div className="sys-cluster-grid">
            <div className="cluster-card">
              <div className="cluster-header">
                <Server size={16} />
                <b>Primary Web Cluster</b>
                <span className="status-dot green" />
              </div>
              <div className="cluster-metrics">
                <div><span>CPU Utilization</span><b>14.2%</b></div>
                <div><span>Memory (RAM)</span><b>2.1 GB / 8 GB</b></div>
                <div><span>HTTP Requests</span><b>4.8k / min</b></div>
              </div>
            </div>

            <div className="cluster-card">
              <div className="cluster-header">
                <Database size={16} />
                <b>Managed PostgreSQL Shard</b>
                <span className="status-dot green" />
              </div>
              <div className="cluster-metrics">
                <div><span>Connections</span><b>38 / 200</b></div>
                <div><span>Replica Lag</span><b>&lt; 2 ms</b></div>
                <div><span>Storage Used</span><b>1.8 GB / 100 GB</b></div>
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="audit-section">
            <div className="section-head">
              <h3>Real-Time Security & Compliance Audit Log</h3>
              <button className="text-button" onClick={() => notify('Audit log exported to CSV')}>
                <Download size={13} /> Export CSV
              </button>
            </div>

            <div className="table-scroll">
              <table className="data-table audit-table">
                <thead>
                  <tr>
                    <th>EVENT ID</th>
                    <th>TIMESTAMP</th>
                    <th>ACTOR / PRINCIPAL</th>
                    <th>ACTION / EVENT</th>
                    <th>IP ADDRESS</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td><code className="code-pill">{log.id}</code></td>
                      <td>{log.time}</td>
                      <td><b>{log.user}</b></td>
                      <td>{log.action}</td>
                      <td><span className="ip-pill">{log.ip}</span></td>
                      <td>
                        <span className={`log-badge ${log.level.toLowerCase()}`}>
                          {log.level}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Quick System Governance Actions */}
        <section className="panel role-quick-links">
          <div className="panel-head">
            <div>
              <h2>Governance Shortcuts</h2>
              <p>Platform controls & IAM settings</p>
            </div>
          </div>

          <div className="governance-actions">
            <button className="gov-btn" onClick={() => go('User & role management')}>
              <div className="gov-icon indigo"><UserCheck size={16} /></div>
              <div>
                <b>User Provisioning & IAM</b>
                <small>Manage role-based permissions & invites</small>
              </div>
            </button>

            <button className="gov-btn" onClick={() => go('Administration')}>
              <div className="gov-icon green"><HardDrive size={16} /></div>
              <div>
                <b>System Settings & Modules</b>
                <small>Tax rules, project master configs, APIs</small>
              </div>
            </button>

            <button className="gov-btn" onClick={() => go('Reports')}>
              <div className="gov-icon amber"><Terminal size={16} /></div>
              <div>
                <b>Enterprise BI & Compliance</b>
                <small>Comprehensive transactional logs & audit</small>
              </div>
            </button>

            <button className="gov-btn" onClick={() => notify('Security scan initiated: 0 vulnerabilities found.')}>
              <div className="gov-icon purple"><Shield size={16} /></div>
              <div>
                <b>Security Vulnerability Scan</b>
                <small>Run OWASP security audit on endpoints</small>
              </div>
            </button>
          </div>

          <div className="system-spec-box">
            <div className="spec-row"><span>Environment:</span> <b>Production (Asia-South1)</b></div>
            <div className="spec-row"><span>Framework:</span> <b>React 19 · Vite 6 · Node 20</b></div>
            <div className="spec-row"><span>Data Isolation:</span> <b>Multi-tenant RBAC</b></div>
            <div className="spec-row"><span>SSL / TLS:</span> <b>TLS 1.3 · 256-bit AES</b></div>
          </div>
        </section>
      </div>
    </div>
  );
}
