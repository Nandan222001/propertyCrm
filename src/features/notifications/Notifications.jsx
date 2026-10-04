import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard, Map, ClipboardList, Wallet, Users, Handshake, Percent,
  ChartNoAxesCombined, FolderOpen, Bell, Settings, Shield, Search, Plus,
  Download, ChevronDown, ChevronRight, Menu, X, ArrowUpRight, MoreHorizontal,
  CalendarDays, Building2, House, Receipt, FileText, Clock3, CheckCircle2,
  AlertCircle, SlidersHorizontal, Send, Eye, Edit2, LockKeyhole, RefreshCw,
  FileSpreadsheet, MapPin, IndianRupee, Mail, Phone, Activity, Trash2, LogOut,
  Sparkles, Check, CheckCircle, Printer, MessageCircle
} from 'lucide-react';
import { parseAmt, fmtINR, amountInWords, agentKey, todayLabel, openWhatsApp, waLink, isAdmin, canCreateBooking, canApprove, canCreateCustomer, canRecordPayment, canManageBills, isCustomer, isPendingStatus } from '../../utils';
import { projects, agents, seedUsers } from '../../data/seedData';

import { RoleContextBanner } from '../../components/layout/RoleContextBanner';

export function Notifications({ fups, FUP, notify, role }) {
  const data = [
    ['Payment overdue · Sneha Mehta', 'Plot B-033 · ₹5,60,000 is 10 days overdue.', 'Today, 9:42 AM', 'alert'],
    ['Installment due · Priya Nair', 'Plot A-101 · ₹4,80,000 due on 05 Oct 2026.', 'Today, 8:15 AM', 'warn'],
    ['New booking confirmed · Rajesh Sharma', 'Plot A-012 confirmed by sales manager.', 'Yesterday, 5:30 PM', 'info'],
    ['Plot hold expiry · Plot C-031', 'Hold period expires in 4 hours for customer.', 'Yesterday, 2:10 PM', 'warn'],
    ['System snapshot backup completed', 'Database cold archive backed up to S3 vault.', 'Yesterday, 1:00 AM', 'system']
  ];

  return (
    <>
      <RoleContextBanner role={role} page="Notifications" />

      <div className="panel section-panel">
        <div className="panel-head">
          <div>
            <h2>Alerts, Follow-ups & Reminders</h2>
            <p>Operational queues filtered for your role</p>
          </div>
        </div>

        <div className="notifications-list">
          {data.map((item, i) => (
            <div className="notification-row" key={i}>
              <span className={`status-dot ${item[3] === 'alert' ? 'red' : item[3] === 'warn' ? 'amber' : 'green'}`} />
              <div className="notification-info">
                <b>{item[0]}</b>
                <p>{item[1]}</p>
                <small>{item[2]}</small>
              </div>
              <button
                className="button button-white small-button"
                onClick={() => {
                  FUP({ ...fups, [i]: true });
                  notify(fups[i] ? 'Already followed up' : 'Action logged in workspace');
                }}
              >
                {fups[i] ? 'Followed up ✓' : 'Take Action'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
