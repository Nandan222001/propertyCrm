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

export function Administration({ notify, role }) {
  const data = [
    ['Organization profile', 'Company information and legal entity registration', Building2],
    ['Projects & layout schemas', 'Phase layouts, plot master blueprints and base rates', Map],
    ['User identity & IAM', 'Multi-factor authentication and role assignment policies', Users],
    ['Tax & GST invoicing', 'Receipt numbering, state GST, TDS withholding percentages', Receipt],
    ['Banking & payment gateways', 'Escrow account details, NEFT/RTGS accounts, virtual IDs', Wallet]
  ];

  return (
    <>
      <RoleContextBanner role={role} page="Administration" />

      <div className="panel section-panel">
        <div className="panel-head">
          <div>
            <h2>System Master Configuration</h2>
            <p>Global parameters, project schemas, and compliance rules</p>
          </div>
        </div>

        <div className="settings-grid">
          {data.map(([title, desc, Icon]) => (
            <div className="setting-card" key={title}>
              <div className="setting-icon"><Icon size={20} /></div>
              <div>
                <b>{title}</b>
                <p>{desc}</p>
                <button className="text-button" onClick={() => notify(`${title} settings opened`)}>
                  Configure module →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
